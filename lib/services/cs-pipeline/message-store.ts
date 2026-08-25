// Simpan pesan CRM + auto-create Contact + history untuk konteks AI.
// Diekstrak dari app/api/internal/messages/route.ts supaya bisa dipanggil
// langsung (webhook Cloud API) maupun via HTTP (wa-service Baileys).

import { Prisma, type MessageRole, type MessageStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { emitWebhookEvent } from '@/lib/services/webhooks/dispatch'

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
  /**
   * Asal pesan: 'WA_DIRECT' | 'WEB_DASHBOARD' | 'AI' | 'WA_HISTORY' |
   * 'TEMPLATE' | 'BROADCAST' | 'FOLLOWUP' | 'SYSTEM' (Trek 2B).
   */
  source?: string | null
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
  /**
   * Jejak template & Kredit Pesan (pesan template Cloud API, Trek 2B).
   * Diisi saat create supaya webhook statuses yang datang cepat langsung
   * menemukan creditUserId (rekonsiliasi).
   */
  billing?: {
    templateId: string
    creditUserId: string | null
    creditChargedRp: number
    pricingCategory: string | null
    broadcastRecipientId?: string | null
  }
  /** Kontak tidak di-REPIN ke sesi pengirim (mis. OTP platform dari sesi admin). */
  skipRepin?: boolean
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
  let contactCreated = false
  if (!contact) {
    contactCreated = true
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
        ...(input.skipRepin ? {} : { waSessionId: input.sessionId }),
        ...windowFields,
      },
    })
  }

  const messageData = {
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
    ...(input.billing
      ? {
          templateId: input.billing.templateId,
          creditUserId: input.billing.creditUserId,
          creditChargedRp: input.billing.creditChargedRp,
          pricingCategory: input.billing.pricingCategory,
          broadcastRecipientId: input.billing.broadcastRecipientId ?? null,
        }
      : {}),
  }

  let message
  try {
    message = await prisma.message.create({ data: messageData })
  } catch (err) {
    const isP2002 = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
    const target = isP2002 ? String((err as Prisma.PrismaClientKnownRequestError).meta?.target ?? '') : ''
    // Kirim-ulang broadcast (klaim basi: worker mati SETELAH Meta menerima
    // pesan pertama) menabrak unique broadcastRecipientId — Message LAMA
    // masih memegang link. Pindahkan link ke pesan terbaru (wamid baru =
    // yang dilacak webhook) lalu coba sekali lagi.
    if (isP2002 && target.includes('broadcastRecipientId') && input.billing?.broadcastRecipientId) {
      await prisma.message.updateMany({
        where: { broadcastRecipientId: input.billing.broadcastRecipientId },
        data: { broadcastRecipientId: null },
      })
      message = await prisma.message.create({ data: messageData })
    } else if (isP2002 && input.externalMsgId) {
      throw new DuplicateExternalMessageError(input.externalMsgId)
    } else {
      throw err
    }
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

  // Webhook keluar (Fase 2 API seller) — fire-and-forget, never-throw:
  // jalur simpan pesan tidak boleh melambat/gagal karena endpoint seller.
  if (contactCreated) {
    emitWebhookEvent({
      userId: wa.userId,
      type: 'contact.created',
      data: {
        contactId: contact.id,
        phoneNumber: contact.phoneNumber,
        name: contact.name,
        sessionId: input.sessionId,
      },
    })
  }
  if (input.role === 'USER') {
    emitWebhookEvent({
      userId: wa.userId,
      type: 'message.received',
      data: {
        messageId: message.id,
        contactId: contact.id,
        phoneNumber: contact.phoneNumber,
        name: contact.name,
        content: input.content,
        sessionId: input.sessionId,
        externalMsgId: input.externalMsgId ?? null,
      },
    })
  }

  return {
    messageId: message.id,
    contactId: contact.id,
    contact: { aiPaused: contact.aiPaused, isResolved: contact.isResolved },
    history,
  }
}
