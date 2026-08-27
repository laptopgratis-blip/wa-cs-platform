// Satu helper untuk MENGKREDIT hasil pembayaran paket (Tripay webhook,
// polling status, cron reconcile, konfirmasi transfer manual) — cabang by
// `purpose`:
//   TOKEN_PURCHASE          → TokenBalance.balance + TokenTransaction PURCHASE
//   MESSAGE_CREDIT_PURCHASE → TokenBalance.messageCreditRp + MessageCreditTransaction
//   LP_UPGRADE              → tidak ada kredit di sini (ditangani /api/lp/upgrade/*)
// Idempoten lewat unique (userId, reference, type) di kedua ledger → P2002
// berarti sudah pernah dikredit (pemanggil memperlakukan sebagai sukses).

import type { PaymentPurpose, Prisma } from '@prisma/client'

import { creditMessageCredits } from '@/lib/services/message-credits'

export interface PaymentCreditInput {
  userId: string
  purpose: PaymentPurpose
  /** Jumlah unit paket: token (TOKEN_PURCHASE) atau Rp kredit (MESSAGE_CREDIT_PURCHASE). */
  amount: number
  reference: string
  description: string
}

export async function applyPaymentCredit(
  tx: Prisma.TransactionClient,
  input: PaymentCreditInput,
): Promise<void> {
  if (input.purpose === 'LP_UPGRADE') return
  if (input.amount <= 0) return

  if (input.purpose === 'MESSAGE_CREDIT_PURCHASE') {
    await creditMessageCredits(tx, {
      userId: input.userId,
      amountRp: input.amount,
      type: 'PURCHASE',
      reference: input.reference,
      description: input.description,
    })
    return
  }

  await tx.tokenBalance.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      balance: input.amount,
      totalPurchased: input.amount,
    },
    update: {
      balance: { increment: input.amount },
      totalPurchased: { increment: input.amount },
    },
  })
  await tx.tokenTransaction.create({
    data: {
      userId: input.userId,
      amount: input.amount,
      type: 'PURCHASE',
      description: input.description,
      reference: input.reference,
    },
  })
}

/** Label unit untuk UI/email: "token" vs "kredit pesan". */
export function unitLabelForPurpose(purpose: PaymentPurpose | string | null | undefined): string {
  return purpose === 'MESSAGE_CREDIT_PURCHASE' ? 'kredit pesan' : 'token'
}

/** Format jumlah unit sesuai purpose (Rp untuk kredit pesan). */
export function formatUnitAmount(purpose: PaymentPurpose | string | null | undefined, amount: number): string {
  return purpose === 'MESSAGE_CREDIT_PURCHASE'
    ? `Rp ${amount.toLocaleString('id-ID')} kredit pesan`
    : `${amount.toLocaleString('id-ID')} token`
}
