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
  broadcastRecipientId: true,
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

  if (delta !== 0) {
    // Koreksi dua arah lewat ADJUSTMENT (reference wamid) — type REFUND
    // dicadangkan KHUSUS refund pesan gagal, supaya unique
    // (userId, wamid, type) tidak menabrak antara koreksi pricing dan
    // refund `failed` untuk wamid yang sama.
    const adj = await adjustMessageCredit({
      userId: msg.creditUserId,
      deltaRp: -delta,
      reference: status.id,
      category: category ?? msg.template?.category ?? null,
      messageId: msg.id,
      description:
        delta < 0
          ? billable
            ? 'Koreksi biaya Meta (lebih murah)'
            : 'Meta tidak menagih pesan ini'
          : 'Koreksi biaya Meta (kategori/harga berbeda)',
    })
    if (!adj.ok) {
      // Ledger gagal ditulis → lepas klaim supaya webhook retry berikutnya
      // mengulang rekonsiliasi (jangan sampai koreksi uang hilang permanen).
      await prisma.message
        .updateMany({
          where: { id: msg.id },
          data: { billingReconciledAt: null, creditChargedRp: charged },
        })
        .catch(() => undefined)
      console.error(`[waba/billing-reconcile] ledger gagal wamid=${status.id} — klaim dilepas`)
      return
    }
  }
  await propagateRecipientCredit(msg.broadcastRecipientId, actual, delta)
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
  const r = await refundMessageCredit({
    userId: msg.creditUserId,
    amountRp: charged,
    reference: wamid,
    category: msg.template?.category ?? null,
    messageId: msg.id,
    description: 'Refund — pesan gagal terkirim',
  })
  if (!r.ok) {
    // Ledger gagal → lepas klaim supaya retry webhook mengulang refund.
    await prisma.message
      .updateMany({
        where: { id: msg.id },
        data: { billingRefundedAt: null, creditChargedRp: charged },
      })
      .catch(() => undefined)
    console.error(`[waba/billing-reconcile] refund gagal wamid=${wamid} — klaim dilepas`)
    return
  }
  await propagateRecipientCredit(msg.broadcastRecipientId, 0, -charged)
}

// Teruskan koreksi biaya ke BroadcastRecipient.creditRp & Broadcast.chargedCreditRp.
// Pakai Message.broadcastRecipientId (bukan cari by recipient.messageId) —
// recipient.messageId baru ditulis worker SETELAH kirim, webhook bisa lebih dulu.
async function propagateRecipientCredit(
  recipientId: string | null,
  actual: number,
  delta: number,
): Promise<void> {
  if (delta === 0 || !recipientId) return
  try {
    const rec = await prisma.broadcastRecipient.findUnique({
      where: { id: recipientId },
      select: { id: true, broadcastId: true },
    })
    if (!rec) return
    await prisma.$transaction([
      prisma.broadcastRecipient.update({ where: { id: rec.id }, data: { creditRp: actual } }),
      prisma.broadcast.update({
        where: { id: rec.broadcastId },
        data: { chargedCreditRp: { increment: delta } },
      }),
    ])
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
