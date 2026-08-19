// Rekonsiliasi Kredit Pesan dari webhook `statuses[]` Cloud API:
// - `pricing.billable/category` → biaya sesungguhnya vs yang sudah dipotong
//   saat kirim (Message.creditChargedRp) → refund/adjust by wamid (idempoten).
// - `failed` → refund penuh (sekali).
// - 131050 (customer stop marketing) → tandai opt-out kontak.
// Hanya berlaku bila Message.creditUserId non-null (sesi admin = tidak ditagih).

import type { MetaTemplateCategory } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  adjustMessageCredit,
  getMessageCreditRates,
  refundMessageCredit,
} from '@/lib/services/message-credits'

import type { WabaStatusUpdate } from './types'

/** Map kategori pricing Meta → kategori template (null = gratis/non-template). */
export function pricingCategoryToTemplateCategory(raw: string | undefined): MetaTemplateCategory | null {
  const c = (raw ?? '').toLowerCase()
  if (c === 'marketing' || c === 'marketing_lite') return 'MARKETING'
  if (c === 'utility') return 'UTILITY'
  if (c === 'authentication' || c === 'authentication-international' || c === 'authentication_international') {
    return 'AUTHENTICATION'
  }
  // service | referral_conversion | lainnya → tidak ditagih ke user
  return null
}

const BILLING_SELECT = {
  id: true,
  creditUserId: true,
  creditChargedRp: true,
  billingReconciledAt: true,
  billingRefundedAt: true,
  template: { select: { category: true } },
} as const

/**
 * Rekonsiliasi biaya satu status webhook. Dipanggil SEBELUM early-return
 * `sent` di statuses.ts (pricing biasanya ikut di event `sent`/`delivered`).
 */
export async function reconcileFromStatus(status: WabaStatusUpdate): Promise<void> {
  if (!status.id) return
  const kind = status.status ?? ''

  if (kind === 'failed') {
    await refundOnFailed(status.id)
    return
  }
  if (!status.pricing) return

  const msg = await prisma.message.findUnique({ where: { externalMsgId: status.id }, select: BILLING_SELECT })
  if (!msg || !msg.creditUserId || msg.billingReconciledAt || msg.billingRefundedAt) return

  const category = pricingCategoryToTemplateCategory(status.pricing.category)
  const billable = status.pricing.billable !== false && category !== null
  const rates = await getMessageCreditRates()
  const actual = billable && category ? rates[category] : 0
  const charged = msg.creditChargedRp ?? 0
  const delta = actual - charged // >0 kurang potong, <0 kelebihan potong

  // Klaim atomik — webhook bisa datang dobel.
  const claimed = await prisma.message.updateMany({
    where: { id: msg.id, billingReconciledAt: null },
    data: {
      billingReconciledAt: new Date(),
      billable,
      pricingCategory: status.pricing.category ?? null,
      creditChargedRp: actual,
    },
  })
  if (claimed.count === 0) return

  if (delta < 0) {
    await refundMessageCredit({
      userId: msg.creditUserId,
      amountRp: -delta,
      reference: status.id,
      category: category ?? msg.template?.category ?? null,
      messageId: msg.id,
      description: billable ? 'Koreksi biaya Meta (lebih murah)' : 'Meta tidak menagih pesan ini',
    })
  } else if (delta > 0) {
    await adjustMessageCredit({
      userId: msg.creditUserId,
      deltaRp: -delta,
      reference: status.id,
      category: category ?? msg.template?.category ?? null,
      messageId: msg.id,
      description: 'Koreksi biaya Meta (kategori/harga berbeda)',
    })
  }
  await propagateRecipientCredit(msg.id, actual, delta)
}

async function refundOnFailed(wamid: string): Promise<void> {
  const msg = await prisma.message.findUnique({ where: { externalMsgId: wamid }, select: BILLING_SELECT })
  if (!msg || !msg.creditUserId || msg.billingRefundedAt) return
  const charged = msg.creditChargedRp ?? 0
  const claimed = await prisma.message.updateMany({
    where: { id: msg.id, billingRefundedAt: null },
    data: { billingRefundedAt: new Date(), creditChargedRp: 0, billable: false },
  })
  if (claimed.count === 0 || charged <= 0) return
  await refundMessageCredit({
    userId: msg.creditUserId,
    amountRp: charged,
    reference: wamid,
    category: msg.template?.category ?? null,
    messageId: msg.id,
    description: 'Refund — pesan gagal terkirim',
  })
  await propagateRecipientCredit(msg.id, 0, -charged)
}

// BroadcastRecipient/Broadcast.chargedCreditRp baru ada di Migrasi 2 —
// akses dinamis supaya file ini tidak perlu diubah lagi nanti.
async function propagateRecipientCredit(messageId: string, actual: number, delta: number): Promise<void> {
  if (delta === 0) return
  const db = prisma as unknown as {
    broadcastRecipient?: {
      findFirst: (args: unknown) => Promise<{ id: string; broadcastId: string } | null>
      update: (args: unknown) => Promise<unknown>
    }
    broadcast?: { update: (args: unknown) => Promise<unknown> }
  }
  if (!db.broadcastRecipient || !db.broadcast) return
  try {
    const rec = await db.broadcastRecipient.findFirst({
      where: { messageId },
      select: { id: true, broadcastId: true },
    })
    if (!rec) return
    await db.broadcastRecipient.update({ where: { id: rec.id }, data: { creditRp: actual } })
    await db.broadcast.update({
      where: { id: rec.broadcastId },
      data: { chargedCreditRp: { increment: delta } },
    })
  } catch (err) {
    console.error('[waba/billing-reconcile] propagasi recipient gagal:', err)
  }
}

/** Tandai kontak opt-out marketing (131050 / user_preferences stop). */
export async function markMarketingOptOut(input: {
  userId: string
  phone: string
  source: 'META_USER_PREFERENCE' | 'META_ERROR_131050' | 'MANUAL'
  optOut: boolean
  detail?: string | null
  metaTimestamp?: Date | null
}): Promise<number> {
  const phone = input.phone.replace(/\D/g, '')
  if (!phone) return 0
  const contacts = await prisma.contact.findMany({
    where: { userId: input.userId, phoneNumber: phone },
    select: { id: true, marketingOptOut: true },
  })
  if (contacts.length === 0) {
    console.log(`[waba/marketing-optout] kontak ${phone} (user ${input.userId}) tidak ada — dilewati`)
    return 0
  }
  const now = new Date()
  await prisma.$transaction([
    prisma.contact.updateMany({
      where: { id: { in: contacts.map((c) => c.id) } },
      data: input.optOut
        ? { marketingOptOut: true, marketingOptOutAt: now, marketingOptOutSource: input.source }
        : { marketingOptOut: false, marketingOptOutAt: null, marketingOptOutSource: null },
    }),
    prisma.marketingPreferenceLog.createMany({
      data: contacts.map((c) => ({
        contactId: c.id,
        userId: input.userId,
        phoneNumber: phone,
        action: input.optOut ? 'STOP' : 'RESUME',
        source: input.source,
        detail: input.detail ?? null,
        metaTimestamp: input.metaTimestamp ?? null,
      })),
    }),
  ])
  return contacts.length
}
