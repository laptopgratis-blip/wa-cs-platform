// Handoff WA untuk LiveLead — dipakai:
//   1. POST /api/live/[slug]/lead (kirim pertama saat customer klik Order WA)
//   2. Cron followup-send (AUTO-RETRY lead HANDOFF_FAILED saat WA owner
//      connect lagi — kasus riil 2026-07-16: WA owner sempat putus saat live,
//      customer lihat "Tim CS sebentar lagi" dan tidak pernah menerima WA).
import { toWaNumber } from '@/lib/phone'
import { prisma } from '@/lib/prisma'
import { logLiveEvent } from '@/lib/services/live/tangkap'
import { smartSend, type SmartSendResult } from '@/lib/services/wa-send/smart-send'
import { listSenderCandidates, type SenderCandidate } from '@/lib/wa-session'

// Kandidat sesi pengirim handoff milik owner (provider-aware, Trek 2B).
export async function findHandoffCandidates(
  userId: string,
  customerPhone?: string,
): Promise<SenderCandidate[]> {
  return listSenderCandidates({ userId, preferContactPhone: customerPhone })
}

// Kirim pesan handoff via smartSend: Baileys / Cloud dalam window → teks;
// Cloud di luar window → template INFO_GENERIC (lead live = customer belum
// pernah chat WA duluan, jadi window hampir pasti tutup di sesi Cloud).
export async function sendHandoffWa(input: {
  candidates: SenderCandidate[]
  to: string
  text: string
  customerName: string
  roomName: string
  productInterest: string | null
}): Promise<SmartSendResult> {
  const summary = input.productInterest
    ? `terima kasih sudah tertarik ${input.productInterest} saat live ${input.roomName} — balas pesan ini untuk lanjut order`
    : `terima kasih sudah ngobrol di live ${input.roomName} — balas pesan ini untuk lanjut order`
  return smartSend({
    candidates: input.candidates,
    to: input.to,
    text: input.text,
    template: {
      purposeKey: 'INFO_GENERIC',
      params: { body: [input.customerName || 'Kak', input.roomName, summary] },
    },
    purpose: 'HANDOFF',
    source: 'SYSTEM',
  })
}

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

  const candidates = await findHandoffCandidates(lead.userId, lead.customerPhone)
  if (candidates.length === 0) return 'SKIPPED' // owner masih offline — coba lagi nanti
  const pinSessionId = candidates[0]!.sessionId

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
        waSessionId: pinSessionId,
        phoneNumber: waNumber,
      },
    },
    create: {
      userId: lead.userId,
      waSessionId: pinSessionId,
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
  const sendResult = await sendHandoffWa({
    candidates,
    to: waNumber,
    text: msg,
    customerName: lead.customerName,
    roomName: lead.liveRoom.name,
    productInterest: lead.productInterest,
  })

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
        waSessionId: sendResult.sessionId ?? pinSessionId,
        via: sendResult.via,
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
