// Kredit Pesan WA (dompet kedua, satuan Rupiah) — dipakai membayar pesan
// template Meta di luar window 24 jam pada sesi Cloud API.
//
// Prinsip (lihat rencana Trek 2B §4):
// - Pre-flight cek saldo sebelum kirim (assertCanSendCloud).
// - Deduct SETELAH Meta menerima pesan (reference = wamid), idempoten via
//   unique (userId, reference, type). TANPA guard gte: pesan sudah terkirim,
//   saldo boleh minus maksimal ±1 pesan per race.
// - Webhook statuses[].pricing merekonsiliasi: refund/adjust by wamid.

import type { MessageCreditTxType, MetaTemplateCategory, Prisma } from '@prisma/client'
import { Prisma as PrismaNs } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export type CreditRates = Record<MetaTemplateCategory, number>

// Fallback kalau tabel kosong (placeholder — admin harus set di /admin).
export const DEFAULT_CREDIT_RATES: CreditRates = {
  UTILITY: 500,
  MARKETING: 1000,
  AUTHENTICATION: 750,
}

const RATE_CACHE_TTL_MS = 60_000
let rateCache: { at: number; rates: CreditRates } | null = null

export async function getMessageCreditRates(opts: { fresh?: boolean } = {}): Promise<CreditRates> {
  if (!opts.fresh && rateCache && Date.now() - rateCache.at < RATE_CACHE_TTL_MS) return rateCache.rates
  try {
    const rows = await prisma.messageCreditRate.findMany()
    const rates: CreditRates = { ...DEFAULT_CREDIT_RATES }
    for (const r of rows) rates[r.category] = r.priceRp
    rateCache = { at: Date.now(), rates }
    return rates
  } catch (err) {
    console.error('[message-credits] gagal baca rate — pakai default:', err)
    return DEFAULT_CREDIT_RATES
  }
}

export function invalidateRateCache(): void {
  rateCache = null
}

/** Harga satu pesan untuk kategori. */
export async function getRateFor(category: MetaTemplateCategory): Promise<number> {
  const rates = await getMessageCreditRates()
  return rates[category] ?? DEFAULT_CREDIT_RATES[category]
}

export async function getMessageCreditBalance(userId: string): Promise<number> {
  const row = await prisma.tokenBalance.findUnique({
    where: { userId },
    select: { messageCreditRp: true },
  })
  return row?.messageCreditRp ?? 0
}

export async function hasEnoughMessageCredit(userId: string, amountRp: number): Promise<boolean> {
  if (amountRp <= 0) return true
  return (await getMessageCreditBalance(userId)) >= amountRp
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof PrismaNs.PrismaClientKnownRequestError && err.code === 'P2002'
}

/**
 * Potong kredit untuk satu pesan yang SUDAH diterima Meta. Idempoten by
 * (userId, reference, USAGE). Never-throw.
 */
export async function chargeMessageCredit(input: {
  userId: string
  amountRp: number
  category: MetaTemplateCategory
  reference: string // wamid
  messageId?: string | null
  description?: string
}): Promise<{ ok: true; alreadyCharged: boolean } | { ok: false; error: string }> {
  if (input.amountRp <= 0) return { ok: true, alreadyCharged: false }
  try {
    await prisma.$transaction(async (tx) => {
      // Ledger dulu — unique menjaga idempoten; kalau P2002, saldo tidak disentuh.
      await tx.messageCreditTransaction.create({
        data: {
          userId: input.userId,
          amountRp: -input.amountRp,
          type: 'USAGE',
          category: input.category,
          reference: input.reference,
          messageId: input.messageId ?? null,
          description: input.description ?? `Pesan template ${input.category.toLowerCase()}`,
        },
      })
      await tx.tokenBalance.upsert({
        where: { userId: input.userId },
        create: {
          userId: input.userId,
          messageCreditRp: -input.amountRp,
          messageCreditUsed: input.amountRp,
        },
        update: {
          messageCreditRp: { decrement: input.amountRp },
          messageCreditUsed: { increment: input.amountRp },
        },
      })
    })
    return { ok: true, alreadyCharged: false }
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: true, alreadyCharged: true }
    console.error('[message-credits] charge gagal:', err)
    return { ok: false, error: (err as Error).message }
  }
}

/** Kembalikan kredit (pesan gagal / Meta tidak menagih). Idempoten by wamid. */
export async function refundMessageCredit(input: {
  userId: string
  amountRp: number
  reference: string
  category?: MetaTemplateCategory | null
  messageId?: string | null
  description?: string
}): Promise<{ ok: true; alreadyRefunded: boolean } | { ok: false; error: string }> {
  if (input.amountRp <= 0) return { ok: true, alreadyRefunded: false }
  return applyLedger({
    ...input,
    deltaRp: input.amountRp,
    type: 'REFUND',
    description: input.description ?? 'Refund pesan template',
  }).then((r) => (r.ok ? { ok: true, alreadyRefunded: r.alreadyApplied } : r))
}

/** Koreksi (+/−) hasil rekonsiliasi webhook pricing. Idempoten by wamid. */
export async function adjustMessageCredit(input: {
  userId: string
  deltaRp: number
  reference: string
  category?: MetaTemplateCategory | null
  messageId?: string | null
  description?: string
}): Promise<{ ok: true; alreadyApplied: boolean } | { ok: false; error: string }> {
  if (input.deltaRp === 0) return { ok: true, alreadyApplied: false }
  return applyLedger({
    ...input,
    type: 'ADJUSTMENT',
    description: input.description ?? 'Rekonsiliasi biaya Meta',
  })
}

async function applyLedger(input: {
  userId: string
  deltaRp: number
  type: MessageCreditTxType
  reference: string
  category?: MetaTemplateCategory | null
  messageId?: string | null
  description: string
}): Promise<{ ok: true; alreadyApplied: boolean } | { ok: false; error: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.messageCreditTransaction.create({
        data: {
          userId: input.userId,
          amountRp: input.deltaRp,
          type: input.type,
          category: input.category ?? null,
          reference: input.reference,
          messageId: input.messageId ?? null,
          description: input.description,
        },
      })
      const used = input.deltaRp < 0 ? { increment: -input.deltaRp } : { decrement: input.deltaRp }
      await tx.tokenBalance.upsert({
        where: { userId: input.userId },
        create: {
          userId: input.userId,
          messageCreditRp: input.deltaRp,
          messageCreditUsed: input.deltaRp < 0 ? -input.deltaRp : 0,
        },
        update: {
          messageCreditRp: { increment: input.deltaRp },
          messageCreditUsed: used,
        },
      })
    })
    return { ok: true, alreadyApplied: false }
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: true, alreadyApplied: true }
    console.error(`[message-credits] ${input.type} gagal:`, err)
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Top-up kredit DI DALAM transaksi pemanggil (webhook Tripay / konfirmasi
 * manual / bonus admin). Throw P2002 bila reference sudah pernah dipakai —
 * pemanggil menangani seperti pola TokenTransaction.
 */
export async function creditMessageCredits(
  tx: Prisma.TransactionClient,
  input: {
    userId: string
    amountRp: number
    type: 'PURCHASE' | 'BONUS' | 'ADJUSTMENT'
    reference?: string | null
    description: string
  },
): Promise<void> {
  if (input.amountRp <= 0) return
  await tx.messageCreditTransaction.create({
    data: {
      userId: input.userId,
      amountRp: input.amountRp,
      type: input.type,
      reference: input.reference ?? null,
      description: input.description,
    },
  })
  await tx.tokenBalance.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      messageCreditRp: input.amountRp,
      messageCreditPurchased: input.type === 'PURCHASE' ? input.amountRp : 0,
    },
    update: {
      messageCreditRp: { increment: input.amountRp },
      ...(input.type === 'PURCHASE' ? { messageCreditPurchased: { increment: input.amountRp } } : {}),
    },
  })
}

/** Format Rp singkat untuk pesan error/UI server. */
export function formatRp(amount: number): string {
  return `Rp ${Math.round(amount).toLocaleString('id-ID')}`
}
