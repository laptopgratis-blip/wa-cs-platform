// Webhook `history` (coexistence): import riwayat chat (≤6 bulan) dari WA
// Business App ke Contact + Message hulao. Aturan:
//   - dari nomor bisnis → AGENT source 'WA_HISTORY'; dari customer → USER
//   - createdAt = timestamp Meta (urutan di inbox benar)
//   - externalMsgId = wamid; createMany skipDuplicates → idempoten terhadap
//     retry webhook, chunk paralel, dan overlap dgn webhook messages/echoes
//   - TIDAK memicu AI, TIDAK relayEmit per pesan (inbox terisi saat refetch)
//   - progres monotonic max (chunk_order bisa out-of-order); DONE saat 100
//   - errors[].code 2593109 = user menolak berbagi riwayat → DECLINED
// Catatan: riwayat nomor eks-Baileys bisa tampil dobel (id Baileys ≠ wamid) —
// diterima sebagai keterbatasan.

import type { MessageStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'

import { importContacts } from './coex-contacts'
import { extractInboundContent } from './inbound'
import type { WabaChangeValue, WabaHistoryMessage, WabaHistoryThread } from './types'

const HISTORY_DECLINED_CODE = 2593109
const CHUNK = 500
const WINDOW_MS = 24 * 60 * 60 * 1000

interface HistorySession {
  id: string
  userId: string
  phoneNumber: string | null
}

export async function handleHistory(value: WabaChangeValue): Promise<void> {
  const phoneNumberId = value.metadata?.phone_number_id
  if (!phoneNumberId) return

  const session = await prisma.whatsappSession.findUnique({
    where: { phoneNumberId },
    select: { id: true, userId: true, provider: true, isActive: true, phoneNumber: true },
  })
  if (!session || session.provider !== 'CLOUD_API' || !session.isActive) return

  const bizNumbers = new Set(
    [phoneNumberId, value.metadata?.display_phone_number, session.phoneNumber]
      .filter((x): x is string => Boolean(x))
      .map((x) => x.replace(/\D/g, '') || x),
  )
  bizNumbers.add(phoneNumberId)

  for (const entry of value.history ?? []) {
    // User menolak berbagi riwayat di HP.
    const declined = entry.errors?.find((e) => e.code === HISTORY_DECLINED_CODE)
    if (declined) {
      await prisma.whatsappSession.update({
        where: { id: session.id },
        data: {
          coexHistorySyncStatus: 'DECLINED',
          coexHistorySyncProgress: 100,
          coexSyncError: 'User menolak berbagi riwayat chat dari WhatsApp Business App',
        },
      })
      console.log(`[waba/history] ${session.id} riwayat DITOLAK user (2593109)`)
      continue
    }
    if (entry.errors && entry.errors.length > 0) {
      const e = entry.errors[0]
      await prisma.whatsappSession.update({
        where: { id: session.id },
        data: {
          coexHistorySyncStatus: 'ERROR',
          coexSyncError: `Sinkronisasi riwayat gagal: ${e.message ?? e.title ?? 'error'}${e.code ? ` (code ${e.code})` : ''}`,
        },
      })
      continue
    }

    const threads = entry.threads ?? []
    const { inserted, contacts } = await importHistoryThreads({
      session,
      bizNumbers,
      threads,
    })

    const progress = Math.max(0, Math.min(100, Math.floor(entry.metadata?.progress ?? 0)))
    // Progres monotonic; status naik ke IN_PROGRESS/DONE, tidak pernah turun
    // dari DONE (chunk telat).
    await prisma.whatsappSession.updateMany({
      where: { id: session.id, coexHistorySyncProgress: { lt: progress } },
      data: { coexHistorySyncProgress: progress },
    })
    await prisma.whatsappSession.updateMany({
      where: {
        id: session.id,
        coexHistorySyncStatus: { notIn: ['DONE', 'DECLINED'] },
      },
      data: { coexHistorySyncStatus: progress >= 100 ? 'DONE' : 'IN_PROGRESS' },
    })
    if (progress >= 100) {
      await prisma.whatsappSession.updateMany({
        where: { id: session.id, coexHistorySyncStatus: 'IN_PROGRESS' },
        data: { coexHistorySyncStatus: 'DONE' },
      })
    }
    if (inserted > 0) {
      await prisma.whatsappSession.update({
        where: { id: session.id },
        data: { coexMessagesImported: { increment: inserted } },
      })
    }
    console.log(
      `[waba/history] ${session.id} phase=${entry.metadata?.phase ?? '-'} chunk=${entry.metadata?.chunk_order ?? '-'} progress=${progress}% threads=${threads.length} kontak=${contacts} pesan_baru=${inserted}`,
    )
  }
}

async function importHistoryThreads(input: {
  session: HistorySession
  bizNumbers: Set<string>
  threads: WabaHistoryThread[]
}): Promise<{ inserted: number; contacts: number }> {
  const { session, bizNumbers, threads } = input
  if (threads.length === 0) return { inserted: 0, contacts: 0 }

  // 1) Pastikan kontak ada.
  const phones = threads.map((t) => ({ phone: t.id.replace(/\D/g, '') })).filter((p) => p.phone)
  const { byPhone } = await importContacts({
    userId: session.userId,
    sessionId: session.id,
    contacts: phones,
  })

  // 2) Susun pesan.
  type Row = {
    contactId: string
    waSessionId: string
    content: string
    role: 'USER' | 'AGENT'
    status: MessageStatus
    source: string
    externalMsgId: string
    createdAt: Date
  }
  const rows: Row[] = []
  const lastAtByContact = new Map<string, Date>()
  const lastInboundByContact = new Map<string, Date>()

  for (const thread of threads) {
    const phone = thread.id.replace(/\D/g, '')
    const contact = byPhone.get(phone)
    if (!contact) continue
    for (const m of thread.messages ?? []) {
      if (!m.id) continue
      const ts = Number(m.timestamp)
      if (!Number.isFinite(ts) || ts <= 0) continue
      const createdAt = new Date(ts * 1000)
      const content = extractHistoryContent(m)
      if (!content) continue
      const from = (m.from ?? '').replace(/\D/g, '') || m.from || ''
      const isBusiness = bizNumbers.has(from)
      rows.push({
        contactId: contact.id,
        waSessionId: session.id,
        content,
        role: isBusiness ? 'AGENT' : 'USER',
        status: isBusiness ? mapHistoryStatus(m.history_context?.status) : 'SENT',
        source: 'WA_HISTORY',
        externalMsgId: m.id,
        createdAt,
      })
      const prev = lastAtByContact.get(contact.id)
      if (!prev || prev < createdAt) lastAtByContact.set(contact.id, createdAt)
      if (!isBusiness) {
        const prevIn = lastInboundByContact.get(contact.id)
        if (!prevIn || prevIn < createdAt) lastInboundByContact.set(contact.id, createdAt)
      }
    }
  }

  // 3) Tulis batch (idempoten).
  let inserted = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const res = await prisma.message.createMany({
      data: rows.slice(i, i + CHUNK),
      skipDuplicates: true,
    })
    inserted += res.count
  }

  // 4) lastMessageAt = max (jangan mundurkan yang lebih baru); window 24 jam
  //    dibuka hanya bila ada pesan customer < 24 jam yang lalu (aturan Meta).
  const now = Date.now()
  for (const [contactId, lastAt] of lastAtByContact) {
    await prisma.contact.updateMany({
      where: { id: contactId, OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: lastAt } }] },
      data: { lastMessageAt: lastAt },
    })
    const lastIn = lastInboundByContact.get(contactId)
    if (lastIn && now - lastIn.getTime() < WINDOW_MS) {
      await prisma.contact.updateMany({
        where: { id: contactId, OR: [{ lastInboundAt: null }, { lastInboundAt: { lt: lastIn } }] },
        data: { lastInboundAt: lastIn, windowExpiresAt: new Date(lastIn.getTime() + WINDOW_MS) },
      })
    }
  }

  return { inserted, contacts: byPhone.size }
}

function extractHistoryContent(m: WabaHistoryMessage): string | null {
  if (m.type === 'media_placeholder') return '[Media]'
  return extractInboundContent(m)?.content ?? null
}

function mapHistoryStatus(status?: string): MessageStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'READ':
    case 'PLAYED':
      return 'READ'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'ERROR':
      return 'FAILED'
    default:
      return 'SENT'
  }
}
