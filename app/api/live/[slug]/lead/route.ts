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
import { normalizePhone } from '@/lib/phone'
import { prisma } from '@/lib/prisma'
import { buildTranscript, logLiveEvent } from '@/lib/services/live/tangkap'
import { waService } from '@/lib/wa-service'

const leadSchema = z.object({
  clientSessionId: z.string().trim().min(8).max(64),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(8).max(20),
  productId: z.string().trim().optional(),
})

function buildHandoffMessage(input: {
  customerName: string
  roomName: string
  productInterest: string | null
  transcript: string
}): string {
  const lines = [
    `Halo ${input.customerName}! 👋`,
    '',
    `Terima kasih sudah ngobrol di live *${input.roomName}*. Saya tim CS yang bantu lanjutin order.`,
  ]
  if (input.productInterest) {
    lines.push('', `Saya lihat tadi minat *${input.productInterest}* — siap bantu detail / kirim invoice.`)
  } else {
    lines.push('', 'Boleh dibantu ke order yang mana ya?')
  }
  return lines.join('\n')
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const parsed = leadSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid', 400)
  }
  const data = parsed.data

  const normalized = normalizePhone(data.phone)
  if (!normalized) {
    return jsonError('Format nomor WA tidak valid (contoh: 08123456789)', 400)
  }

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
    select: { id: true, status: true, customerPhone: true },
  })
  if (existingLead) {
    return jsonOk({
      leadId: existingLead.id,
      status: existingLead.status,
      duplicate: true,
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

  // ── Handoff WA (best-effort) ────────────────────────────────────────
  // Cari WA session CONNECTED milik owner. Kalau gak ada, skip — owner
  // bisa follow-up manual dari /live-rooms/[id]/leads.
  const waSession = await prisma.whatsappSession.findFirst({
    where: { userId: room.userId, status: 'CONNECTED' },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  })

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
    return jsonOk({ leadId: lead.id, status: 'HANDOFF_FAILED' as const })
  }

  // Upsert Contact di CRM.
  const contact = await prisma.contact.upsert({
    where: {
      waSessionId_phoneNumber: {
        waSessionId: waSession.id,
        phoneNumber: normalized,
      },
    },
    create: {
      userId: room.userId,
      waSessionId: waSession.id,
      phoneNumber: normalized,
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
    transcript,
  })
  const sendResult = await waService.sendMessage(
    waSession.id,
    normalized.replace(/^\+/, ''),
    waMessage,
  )

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
  return jsonOk({ leadId: lead.id, status: 'HANDOFF_FAILED' as const })
}
