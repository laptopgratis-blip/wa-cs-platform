// POST /api/live/[slug]/embed-gate — capture gate dari LP embed (sebelum chat).
// Body: { clientSessionId, lpId, name, phone, productInterest? }
//
// Beda dari /api/live/[slug]/lead:
// - Tidak butuh LiveSession yg sudah ada (otomatis create via ensureLiveSession)
// - Tag attribusi: dari LP mana lead datang (LpEvent log)
// - Sama-sama handoff WA via wa-service (best-effort)
//
// Idempotent: kalau lead sudah ada untuk session, return existing.
import { createHash } from 'node:crypto'

import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api'
import { getClientIp } from '@/lib/client-ip'
import { normalizePhone } from '@/lib/phone'
import { prisma } from '@/lib/prisma'
import { generateQueueForLead } from '@/lib/services/followup-engine'
import { checkLeadRateLimit, maybeCleanup } from '@/lib/services/live/rate-limit'
import { ensureLiveSession, logLiveEvent, makeFingerprint } from '@/lib/services/live/tangkap'
import { waService } from '@/lib/wa-service'

function hashIp(ip: string): string {
  const salt = process.env.IP_SALT ?? 'hulao-default-ip-salt-rotate-me'
  return createHash('sha256').update(`${ip}|${salt}`).digest('hex')
}

const gateSchema = z.object({
  clientSessionId: z.string().trim().min(8).max(64),
  lpId: z.string().trim().min(1),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(8).max(20),
  productInterest: z.string().trim().max(200).optional(),
  email: z.string().trim().email().max(120).optional(),
  city: z.string().trim().max(80).optional(),
})

function buildEmbedHandoffMessage(input: {
  customerName: string
  roomName: string
  productInterest: string | null
}): string {
  const lines = [
    `Halo ${input.customerName}! 👋`,
    '',
    `Terima kasih udah mampir & isi data di halaman *${input.roomName}*.`,
  ]
  if (input.productInterest) {
    lines.push('', `Tadi minat *${input.productInterest}* ya? Siap bantu detail / kirim invoice.`)
  } else {
    lines.push('', 'Mau lanjut info produk atau langsung order? Saya bantu di sini ya.')
  }
  return lines.join('\n')
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  // Rate limit ketat (5/menit per IP per slug) — sama kelas dengan
  // /api/live/[slug]/lead: endpoint publik terima PII + memicu kirim WA.
  // IP dari elemen terakhir XFF (trusted hop Traefik), anti-spoof.
  const ip = getClientIp(req)
  const rl = checkLeadRateLimit(ip, slug)
  if (!rl.ok) {
    return jsonError(
      `Terlalu banyak percobaan. Coba lagi dalam ${rl.retryAfterSec ?? 60}dtk.`,
      429,
    )
  }
  maybeCleanup()

  const parsed = gateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid', 400)
  }
  const data = parsed.data

  const normalized = normalizePhone(data.phone)
  if (!normalized) {
    return jsonError('Format nomor WA tidak valid (contoh: 08123456789)', 400)
  }

  // Validate room + LP-embed match.
  const room = await prisma.liveRoom.findUnique({
    where: { slug },
    select: { id: true, name: true, userId: true, isActive: true },
  })
  if (!room) return jsonError('Room tidak ditemukan', 404)
  if (!room.isActive) return jsonError('Live offline', 410)

  const embed = await prisma.lpLiveEmbed.findUnique({
    where: { landingPageId: data.lpId },
    select: { id: true, liveRoomId: true, isActive: true, userId: true, landingPage: { select: { id: true, slug: true } } },
  })
  if (!embed || !embed.isActive || embed.liveRoomId !== room.id) {
    return jsonError('Konfigurasi embed tidak valid', 400)
  }

  // Build fingerprint dari IP + UA — analytics dedup. IP sudah diresolve di
  // atas via getClientIp (elemen terakhir XFF, bukan yang bisa dipalsukan).
  const ua = req.headers.get('user-agent')
  const fingerprint = makeFingerprint({ ip, ua })

  // Ensure session — create kalau belum ada (gate sebelum chat).
  const { id: sessionId } = await ensureLiveSession({
    clientSessionId: data.clientSessionId,
    liveRoomId: room.id,
    userId: room.userId,
    fingerprint,
    customerName: data.name,
    customerPhone: normalized,
  })

  // Idempotency lead per session.
  const existingLead = await prisma.liveLead.findUnique({
    where: { liveSessionId: sessionId },
    select: { id: true, status: true },
  })
  if (existingLead) {
    return jsonOk({ leadId: existingLead.id, status: existingLead.status, duplicate: true })
  }

  // Build transcript placeholder — kalau gate-first, transcript kosong/dummy.
  // Owner masih bisa lihat di inbox CRM.
  const transcript = `[Embed gate dari LP /p/${embed.landingPage.slug}]\nName: ${data.name}\nPhone: ${normalized}${data.productInterest ? `\nMinat: ${data.productInterest}` : ''}${data.email ? `\nEmail: ${data.email}` : ''}${data.city ? `\nKota: ${data.city}` : ''}`

  const lead = await prisma.liveLead.create({
    data: {
      userId: room.userId,
      liveRoomId: room.id,
      liveSessionId: sessionId,
      customerName: data.name,
      customerPhone: normalized,
      productInterest: data.productInterest ?? null,
      transcript,
      status: 'NEW',
    },
    select: { id: true },
  })

  await logLiveEvent({
    liveSessionId: sessionId,
    type: 'LEAD_CAPTURE',
    payload: {
      name: data.name,
      phone: normalized,
      source: 'lp_embed_gate',
      lpId: data.lpId,
    },
  })

  // Log juga ke LpEvent untuk attribution dashboard LP.
  await prisma.lpEvent
    .create({
      data: {
        landingPageId: data.lpId,
        eventType: 'live_lead_capture',
        eventValue: `${lead.id}|${slug}`,
        ipHash: hashIp(ip),
      },
    })
    .catch(() => {/* LpEvent log best-effort, jangan blocking */})

  // Handoff WA best-effort — sama pola dgn /api/live/[slug]/lead.
  let handoffStatus: 'HANDOFF_SENT' | 'HANDOFF_FAILED' = 'HANDOFF_FAILED'
  let handoffError: string | null = null
  let contactId: string | null = null
  try {
    const session = await prisma.whatsappSession.findFirst({
      where: { userId: room.userId, status: 'CONNECTED' },
      select: { id: true, phoneNumber: true },
    })
    if (session) {
      const contact = await prisma.contact.upsert({
        where: {
          waSessionId_phoneNumber: { waSessionId: session.id, phoneNumber: normalized },
        },
        create: {
          userId: room.userId,
          waSessionId: session.id,
          phoneNumber: normalized,
          name: data.name,
          pipelineStage: 'NEW',
          tags: ['live-embed', `lp:${embed.landingPage.slug}`],
        },
        update: {
          name: data.name,
          tags: { push: 'live-embed' },
        },
        select: { id: true },
      })
      contactId = contact.id

      const msg = buildEmbedHandoffMessage({
        customerName: data.name,
        roomName: room.name,
        productInterest: data.productInterest ?? null,
      })
      await waService.sendMessage(session.id, normalized, msg)
      handoffStatus = 'HANDOFF_SENT'

      await logLiveEvent({
        liveSessionId: sessionId,
        type: 'HANDOFF_WA',
        payload: { phoneNumber: normalized, sessionId: session.id, success: true },
      })
    } else {
      handoffError = 'Owner belum punya WA session CONNECTED'
    }
  } catch (err) {
    handoffError = err instanceof Error ? err.message : String(err)
    await logLiveEvent({
      liveSessionId: sessionId,
      type: 'HANDOFF_WA',
      payload: { phoneNumber: normalized, success: false, error: handoffError },
    })
  }

  await prisma.liveLead.update({
    where: { id: lead.id },
    data: { status: handoffStatus, contactId, handoffError },
  })

  // Nurture "belum order" — jadwalkan follow-up WA H+1 & H+3 (best-effort).
  try {
    await generateQueueForLead(lead.id)
  } catch (err) {
    console.error('[live-embed-gate] generateQueueForLead failed', err)
  }

  return jsonOk({ leadId: lead.id, status: handoffStatus, sessionId, duplicate: false })
}
