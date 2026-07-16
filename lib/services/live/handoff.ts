// Handoff WA untuk LiveLead — dipakai:
//   1. POST /api/live/[slug]/lead (kirim pertama saat customer klik Order WA)
//   2. Cron followup-send (AUTO-RETRY lead HANDOFF_FAILED saat WA owner
//      connect lagi — kasus riil 2026-07-16: WA owner sempat putus saat live,
//      customer lihat "Tim CS sebentar lagi" dan tidak pernah menerima WA).
import { toWaNumber } from '@/lib/phone'
import { prisma } from '@/lib/prisma'
import { logLiveEvent } from '@/lib/services/live/tangkap'
import { waService } from '@/lib/wa-service'

// Marker klaim anti dobel-kirim antar run cron yang overlap. Klaim dianggap
// basi (boleh diambil proses lain) kalau updatedAt-nya lebih tua dari ini —
// menutup kasus proses mati di tengah kirim.
export const HANDOFF_RETRY_CLAIM = '[retrying]'
export const HANDOFF_CLAIM_STALE_MS = 10 * 60 * 1000

export function buildHandoffMessage(input: {
  customerName: string
  roomName: string
  productInterest: string | null
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

// Nomor WA owner untuk fallback wa.me — dipakai customer saat handoff gagal
// supaya bisa MEMULAI chat sendiri. Nomor tetap bisa menerima chat masuk
// walau Baileys disconnected (bot mati ≠ WA owner mati). Prefer session
// CONNECTED terbaru; fallback ke session mana pun yang punya nomor.
export async function ownerWaMeNumber(userId: string): Promise<string | null> {
  const connected = await prisma.whatsappSession.findFirst({
    where: { userId, status: 'CONNECTED', phoneNumber: { not: null } },
    orderBy: { updatedAt: 'desc' },
    select: { phoneNumber: true },
  })
  if (connected?.phoneNumber) return connected.phoneNumber
  const any = await prisma.whatsappSession.findFirst({
    where: { userId, phoneNumber: { not: null } },
    orderBy: { updatedAt: 'desc' },
    select: { phoneNumber: true },
  })
  return any?.phoneNumber ?? null
}

// URL wa.me siap pakai untuk tombol "Chat CS via WA" di live room.
export async function buildWaMeFallback(input: {
  userId: string
  customerName: string
  roomName: string
  productInterest: string | null
}): Promise<string | null> {
  const num = await ownerWaMeNumber(input.userId)
  if (!num) return null
  const text = `Halo, saya ${input.customerName} dari live "${input.roomName}"${
    input.productInterest ? ` — mau order ${input.productInterest}` : ' — mau order'
  }.`
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`
}

export type HandoffRetryResult = 'SENT' | 'FAILED' | 'SKIPPED'

// Coba kirim ulang handoff untuk lead HANDOFF_FAILED. Idempotent & race-safe:
// klaim atomik via handoffError=[retrying] sebelum kirim; hanya lanjut kalau
// klaim menang. SKIPPED = tidak ada session CONNECTED / lead sudah ditangani
// proses lain — aman dicoba lagi di run berikutnya.
export async function retryLeadHandoff(leadId: string): Promise<HandoffRetryResult> {
  const lead = await prisma.liveLead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      status: true,
      userId: true,
      liveSessionId: true,
      customerName: true,
      customerPhone: true,
      productInterest: true,
      transcript: true,
      liveRoom: { select: { name: true } },
    },
  })
  if (!lead || lead.status !== 'HANDOFF_FAILED') return 'SKIPPED'

  const waSession = await prisma.whatsappSession.findFirst({
    where: { userId: lead.userId, status: 'CONNECTED' },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  })
  if (!waSession) return 'SKIPPED' // owner masih offline — coba lagi nanti

  // Klaim atomik. Klaim [retrying] yang basi (proses mati) boleh direbut.
  const staleBefore = new Date(Date.now() - HANDOFF_CLAIM_STALE_MS)
  const claimed = await prisma.liveLead.updateMany({
    where: {
      id: lead.id,
      status: 'HANDOFF_FAILED',
      OR: [
        { NOT: { handoffError: HANDOFF_RETRY_CLAIM } },
        { handoffError: HANDOFF_RETRY_CLAIM, updatedAt: { lt: staleBefore } },
      ],
    },
    data: { handoffError: HANDOFF_RETRY_CLAIM },
  })
  if (claimed.count === 0) return 'SKIPPED'

  const waNumber = toWaNumber(lead.customerPhone)
  if (!waNumber) {
    await prisma.liveLead.update({
      where: { id: lead.id },
      data: { handoffError: 'Nomor customer tidak valid untuk WA' },
    })
    return 'FAILED'
  }

  // Upsert Contact di CRM — sama seperti kirim pertama di route /lead.
  const contact = await prisma.contact.upsert({
    where: {
      waSessionId_phoneNumber: {
        waSessionId: waSession.id,
        phoneNumber: waNumber,
      },
    },
    create: {
      userId: lead.userId,
      waSessionId: waSession.id,
      phoneNumber: waNumber,
      name: lead.customerName,
      tags: ['live-room'],
      pipelineStage: 'PROSPECT',
      notes: `Lead dari live room "${lead.liveRoom.name}" — produk minat: ${lead.productInterest ?? '(belum spesifik)'} (handoff retry otomatis).`,
    },
    update: { name: lead.customerName },
    select: { id: true },
  })

  const msg = buildHandoffMessage({
    customerName: lead.customerName,
    roomName: lead.liveRoom.name,
    productInterest: lead.productInterest,
  })
  const sendResult = await waService.sendMessage(waSession.id, waNumber, msg)

  if (sendResult.success) {
    await prisma.liveLead.update({
      where: { id: lead.id },
      data: { status: 'HANDOFF_SENT', contactId: contact.id, handoffError: null },
    })
    await logLiveEvent({
      liveSessionId: lead.liveSessionId,
      type: 'HANDOFF_WA',
      payload: {
        success: true,
        retry: true,
        contactId: contact.id,
        waSessionId: waSession.id,
      },
    })
    return 'SENT'
  }

  await prisma.liveLead.update({
    where: { id: lead.id },
    data: {
      status: 'HANDOFF_FAILED',
      contactId: contact.id,
      handoffError: sendResult.error ?? 'Unknown wa-service error',
    },
  })
  await logLiveEvent({
    liveSessionId: lead.liveSessionId,
    type: 'HANDOFF_WA',
    payload: { success: false, retry: true, error: sendResult.error ?? null },
  })
  return 'FAILED'
}
