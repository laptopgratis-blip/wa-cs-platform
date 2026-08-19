// Simpan pesan CRM + auto-create Contact + history untuk konteks AI.
// Diekstrak dari app/api/internal/messages/route.ts supaya bisa dipanggil
// langsung (webhook Cloud API) maupun via HTTP (wa-service Baileys).

import { Prisma, type MessageRole, type MessageStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'

// Window customer service Meta: 24 jam sejak pesan masuk terakhir.
const WINDOW_MS = 24 * 60 * 60 * 1000

export interface SaveMessageInput {
  sessionId: string
  /** Nomor lawan bicara — boleh JID Baileys, dinormalisasi di sini. */
  phoneNumber: string
  pushName?: string | null
  content: string
  role: MessageRole
  tokensUsed?: number
  /** Kalau true: sertakan 10 pesan terakhir (kronologis) untuk konteks AI. */
  withHistory?: boolean
  source?: 'WA_DIRECT' | 'WEB_DASHBOARD' | 'AI' | 'WA_HISTORY'
  externalMsgId?: string | null
  status?: MessageStatus
  apiInputTokens?: number
  apiOutputTokens?: number
  apiCostRp?: number
  tokensCharged?: number
  revenueRp?: number
  profitRp?: number
  /**
   * Sesi CLOUD_API: pesan masuk customer membuka/refresh window 24 jam Meta.
   * Baileys tidak memakai ini (tidak ada aturan window).
   */
  touchWindow?: boolean
}

export interface SavedMessageHistoryItem {
  role: string
  content: string
  createdAt: Date
}

export interface SaveMessageResult {
  messageId: string
  contactId: string
  contact: { aiPaused: boolean; isResolved: boolean }
  history: SavedMessageHistoryItem[]
}

/**
 * externalMsgId UNIQUE di DB — pesan dengan ID eksternal (wamid / Baileys id)
 * yang sudah pernah disimpan ditolak Postgres (P2002). Dilempar sebagai error
 * bertipe supaya caller bisa memperlakukannya sebagai "duplikat, skip" (webhook
 * retry, race echo fromMe vs simpan web), bukan kegagalan.
 */
export class DuplicateExternalMessageError extends Error {
  constructor(public readonly externalMsgId: string) {
    super(`Pesan dengan externalMsgId ${externalMsgId} sudah tersimpan`)
    this.name = 'DuplicateExternalMessageError'
  }
}

export function isDuplicateExternalMessageError(err: unknown): err is DuplicateExternalMessageError {
  return err instanceof DuplicateExternalMessageError
}

// Normalisasi phoneNumber sebelum lookup/create kontak supaya tidak duplikat.
// @s.whatsapp.net → ambil digit sebelum @ (dan sebelum :deviceId kalau ada).
// @lid → biarkan as-is karena LID adalah ID opaque, bukan nomor asli.
export function normalizePhoneNumber(input: string): string {
  if (input.endsWith('@lid')) return input
  if (input.includes('@')) {
    const beforeAt = input.split('@')[0] ?? input
    return beforeAt.split(':')[0] ?? beforeAt
  }
  return input
}

/**
 * Simpan satu pesan. Return null kalau session tidak ditemukan (caller HTTP
 * memetakan ke 404). Kontak dicari by userId+phoneNumber (bukan waSessionId)
 * supaya tidak duplikat saat sesi berganti; waSessionId kontak di-REPIN ke
 * sesi pesan terakhir — balasan CS selalu lewat channel terakhir customer.
 */
export async function saveMessage(
  input: SaveMessageInput,
): Promise<SaveMessageResult | null> {
  const wa = await prisma.whatsappSession.findUnique({
    where: { id: input.sessionId },
    select: { id: true, userId: true },
  })
  if (!wa) return null

  const now = new Date()
  const windowFields = input.touchWindow
    ? { lastInboundAt: now, windowExpiresAt: new Date(now.getTime() + WINDOW_MS) }
    : {}

  const phoneNumber = normalizePhoneNumber(input.phoneNumber)
  let contact = await prisma.contact.findFirst({
    where: { userId: wa.userId, phoneNumber },
  })
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        userId: wa.userId,
        waSessionId: input.sessionId,
        phoneNumber,
        name: input.pushName ?? null,
        lastMessageAt: now,
        ...windowFields,
      },
    })
  } else {
    contact = await prisma.contact.update({
      where: { id: contact.id },
      data: {
        name: input.pushName ?? undefined,
        lastMessageAt: now,
        waSessionId: input.sessionId,
        ...windowFields,
      },
    })
  }

  let message
  try {
    message = await prisma.message.create({
      data: {
        contactId: contact.id,
        waSessionId: input.sessionId,
        content: input.content,
        role: input.role,
        tokensUsed: input.tokensUsed ?? null,
        apiInputTokens: input.apiInputTokens ?? null,
        apiOutputTokens: input.apiOutputTokens ?? null,
        apiCostRp: input.apiCostRp ?? null,
        tokensCharged: input.tokensCharged ?? null,
        revenueRp: input.revenueRp ?? null,
        profitRp: input.profitRp ?? null,
        source: input.source ?? null,
        externalMsgId: input.externalMsgId ?? null,
        // Absent → biarkan default schema (SENT).
        status: input.status ?? undefined,
      },
    })
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002' &&
      input.externalMsgId
    ) {
      throw new DuplicateExternalMessageError(input.externalMsgId)
    }
    throw err
  }

  let history: SavedMessageHistoryItem[] = []
  if (input.withHistory) {
    // 10 pesan terakhir (terbaru dulu) → balik ke kronologis untuk AI.
    // Kecualikan FAILED (balasan yang tak pernah diterima customer) supaya
    // AI tidak mengira sudah menjawab.
    const recent = await prisma.message.findMany({
      where: { contactId: contact.id, status: { not: 'FAILED' } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { role: true, content: true, createdAt: true },
    })
    history = recent.reverse()
  }

  return {
    messageId: message.id,
    contactId: contact.id,
    contact: { aiPaused: contact.aiPaused, isResolved: contact.isResolved },
    history,
  }
}
