// POST /api/live/[slug]/lead — capture lead + handoff WA.
// Body: { clientSessionId, name, phone, productId? }
// Flow:
//   1. Validate session belongs to this slug
//   2. Build transcript
//   3. Create LiveLead (status=NEW)
//   4. Upsert Contact di CRM Hulao (kalau owner punya WhatsappSession CONNECTED)
//   5. Send WA pertama via wa-service (best-effort)
//   6. Update lead.status + log events
//
// Idempotent: kalau lead untuk session sudah ada → return existing.
import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api'
import { getClientIp } from '@/lib/client-ip'
import { normalizePhone, toWaNumber } from '@/lib/phone'
import { prisma } from '@/lib/prisma'
import { generateQueueForLead } from '@/lib/services/followup-engine'
import {
  buildHandoffMessage,
  buildWaMeFallback,
  findHandoffCandidates,
  sendHandoffWa,
} from '@/lib/services/live/handoff'
import { checkLeadRateLimit, maybeCleanup } from '@/lib/services/live/rate-limit'
import { buildTranscript, logLiveEvent } from '@/lib/services/live/tangkap'

const leadSchema = z.object({
  clientSessionId: z.string().trim().min(8).max(64),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(8).max(20),
  productId: z.string().trim().optional(),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  // Rate limit ketat (5/menit per IP per slug) — endpoint publik yang terima
  // PII + memicu kirim WA. IP dari elemen terakhir XFF (trusted hop Traefik).
  const ip = getClientIp(req)
  const rl = checkLeadRateLimit(ip, slug)
  if (!rl.ok) {
    return jsonError(
      `Terlalu banyak percobaan. Coba lagi dalam ${rl.retryAfterSec ?? 60}dtk.`,
      429,
    )
  }
  maybeCleanup()

  const parsed = leadSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid', 400)
  }
  const data = parsed.data

  const normalized = normalizePhone(data.phone)
  if (!normalized) {
    return jsonError('Format nomor WA tidak valid (contoh: 08123456789)', 400)
  }
  // Digit-only untuk Contact.phoneNumber (samakan dgn flow AI CS).
  const waNumber = toWaNumber(normalized) as string

  const room = await prisma.liveRoom.findUnique({
    where: { slug },
    select: { id: true, name: true, userId: true, isActive: true },
  })
  if (!room) return jsonError('Room tidak ditemukan', 404)
  if (!room.isActive) return jsonError('Live offline', 410)

  const session = await prisma.liveSession.findUnique({
    where: { clientSessionId: data.clientSessionId },
    select: { id: true, liveRoomId: true, userId: true },
  })
  if (!session) return jsonError('Session tidak valid — refresh halaman dulu', 400)
  if (session.liveRoomId !== room.id) {
    return jsonError('Session ID milik room lain', 400)
  }

  // Idempotency — kalau sudah ada lead untuk session ini, return existing.
  const existingLead = await prisma.liveLead.findUnique({
    where: { liveSessionId: session.id },
    select: { id: true, status: true, customerPhone: true, productInterest: true },
  })
  if (existingLead) {
    return jsonOk({
      leadId: existingLead.id,
      status: existingLead.status,
      duplicate: true,
      // Fallback wa.me untuk status FAILED (lead embed juga lewat sini saat
      // klik Order WA) — customer bisa memulai chat sendiri tanpa nunggu.
      waMeUrl:
        existingLead.status === 'HANDOFF_FAILED'
          ? await buildWaMeFallback({
              userId: room.userId,
              customerName: data.name,
              roomName: room.name,
              productInterest: existingLead.productInterest,
            })
          : null,
    })
  }

  const transcript = await buildTranscript(session.id)

  // Resolve produk yg di-klik / dipilih customer (kalau ada).
  let productName: string | null = null
  if (data.productId) {
    const prod = await prisma.product.findUnique({
      where: { id: data.productId },
      select: { name: true, userId: true },
    })
    if (prod && prod.userId === room.userId) productName = prod.name
  }

  // Buat lead row dulu — handoff WA jadi best-effort di bawah.
  const lead = await prisma.liveLead.create({
    data: {
      userId: room.userId,
      liveRoomId: room.id,
      liveSessionId: session.id,
      customerName: data.name,
      customerPhone: normalized,
      productInterest: productName,
      transcript,
      status: 'NEW',
    },
    select: { id: true },
  })

  await prisma.liveSession.update({
    where: { id: session.id },
    data: {
      customerName: data.name,
      customerPhone: normalized,
    },
  })
  await logLiveEvent({
    liveSessionId: session.id,
    type: 'LEAD_CAPTURE',
    payload: { name: data.name, phone: normalized, productId: data.productId ?? null },
  })

  // Nurture "belum order" — jadwalkan follow-up WA H+1 & H+3 (best-effort,
  // tidak boleh menggagalkan lead capture). Auto-berhenti kalau customer order.
  try {
    await generateQueueForLead(lead.id)
  } catch (err) {
    console.error('[live-lead] generateQueueForLead failed', err)
  }

  // ── Handoff WA (best-effort) ────────────────────────────────────────
  // Cari WA session CONNECTED milik owner. Kalau gak ada, skip — owner
  // bisa follow-up manual dari /live-rooms/[id]/leads.
  // Provider-aware (Trek 2B): Baileys / Cloud API. Kandidat pertama dipakai
  // untuk pin Contact; pengiriman via sendHandoffWa (smartSend).
  const candidates = await findHandoffCandidates(room.userId, waNumber)
  const waSession = candidates[0] ? { id: candidates[0].sessionId } : null

  if (!waSession) {
    await logLiveEvent({
      liveSessionId: session.id,
      type: 'HANDOFF_WA',
      payload: {
        success: false,
        error: 'Owner tidak punya WhatsappSession CONNECTED',
      },
    })
    await prisma.liveLead.update({
      where: { id: lead.id },
      data: { status: 'HANDOFF_FAILED', handoffError: 'No connected WA session' },
    })
    // Cron followup-send akan auto-retry saat WA owner connect lagi; sambil
    // menunggu, beri customer jalur wa.me untuk memulai chat sendiri.
    return jsonOk({
      leadId: lead.id,
      status: 'HANDOFF_FAILED' as const,
      waMeUrl: await buildWaMeFallback({
        userId: room.userId,
        customerName: data.name,
        roomName: room.name,
        productInterest: productName,
      }),
    })
  }

  // Upsert Contact di CRM.
  const contact = await prisma.contact.upsert({
    where: {
      waSessionId_phoneNumber: {
        waSessionId: waSession.id,
        phoneNumber: waNumber,
      },
    },
    create: {
      userId: room.userId,
      waSessionId: waSession.id,
      phoneNumber: waNumber,
      name: data.name,
      tags: ['live-room'],
      pipelineStage: 'PROSPECT',
      notes: `Lead dari live room "${room.name}" — produk minat: ${productName ?? '(belum spesifik)'}.\n\nTranskrip awal:\n${transcript.slice(0, 1000)}`,
    },
    update: {
      // Append tag tanpa duplicate.
      tags: {
        push: 'live-room',
      },
      name: data.name,
      notes: `Re-engaged via live "${room.name}".\nProduk: ${productName ?? '(belum spesifik)'}`,
    },
    select: { id: true },
  })

  // Send WA — Baileys format tanpa '+'.
  const waMessage = buildHandoffMessage({
    customerName: data.name,
    roomName: room.name,
    productInterest: productName,
  })
  const sendResult = await sendHandoffWa({
    candidates,
    to: waNumber,
    text: waMessage,
    customerName: data.name,
    roomName: room.name,
    productInterest: productName,
  })

  if (sendResult.success) {
    await prisma.liveLead.update({
      where: { id: lead.id },
      data: { status: 'HANDOFF_SENT', contactId: contact.id },
    })
    await logLiveEvent({
      liveSessionId: session.id,
      type: 'HANDOFF_WA',
      payload: {
        success: true,
        contactId: contact.id,
        waSessionId: waSession.id,
        phoneNumber: normalized,
      },
    })
    return jsonOk({ leadId: lead.id, status: 'HANDOFF_SENT' as const })
  }

  // WA gagal → tetap simpan kontak (owner bisa kirim manual).
  await prisma.liveLead.update({
    where: { id: lead.id },
    data: {
      status: 'HANDOFF_FAILED',
      contactId: contact.id,
      handoffError: sendResult.error ?? 'Unknown wa-service error',
    },
  })
  await logLiveEvent({
    liveSessionId: session.id,
    type: 'HANDOFF_WA',
    payload: {
      success: false,
      error: sendResult.error ?? 'Unknown wa-service error',
      contactId: contact.id,
    },
  })
  return jsonOk({
    leadId: lead.id,
    status: 'HANDOFF_FAILED' as const,
    waMeUrl: await buildWaMeFallback({
      userId: room.userId,
      customerName: data.name,
      roomName: room.name,
      productInterest: productName,
    }),
  })
}
