// Billing balasan CS AI: pre-flight saldo + charge proporsional dari usage
// real (inputTokens/outputTokens × harga AiModel × margin CS_REPLY).
// Diekstrak dari app/api/internal/tokens/charge-cs-reply/route.ts.

import { prisma } from '@/lib/prisma'
import {
  computeChargeFromUsage,
  deductTokenAtomic,
  logGeneration,
} from '@/lib/services/ai-generation-log'

export interface ChargeCsReplyInput {
  userId: string
  sessionId: string
  /** FK ke AiModel.id — pricing di-lookup dari row-nya. */
  aiModelId: string
  inputTokens: number
  outputTokens: number
}

export interface ChargeCsReplyResult {
  ok: boolean
  /** true kalau gagal karena saldo tidak cukup (bukan error lain). */
  insufficient?: boolean
  modelNotFound?: boolean
  tokensCharged?: number
  apiCostUsd?: number
  apiCostRp?: number
  revenueRp?: number
  profitRp?: number
  marginPct?: number
  balance?: number
}

export async function chargeCsReply(
  input: ChargeCsReplyInput,
): Promise<ChargeCsReplyResult> {
  const model = await prisma.aiModel.findUnique({
    where: { id: input.aiModelId },
    select: {
      id: true,
      modelId: true,
      inputPricePer1M: true,
      outputPricePer1M: true,
    },
  })
  if (!model) return { ok: false, modelNotFound: true }

  const charge = await computeChargeFromUsage({
    featureKey: 'CS_REPLY',
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    priceOverride: {
      modelName: model.modelId,
      inputPricePer1M: model.inputPricePer1M,
      outputPricePer1M: model.outputPricePer1M,
    },
  })

  const ded = await deductTokenAtomic({
    userId: input.userId,
    tokensCharged: charge.tokensCharged,
    description: `CS Reply via ${model.modelId}`,
    reference: `cs_reply:${input.sessionId}`,
  })

  await logGeneration({
    featureKey: 'CS_REPLY',
    userId: input.userId,
    subjectType: 'WA_SESSION',
    subjectId: input.sessionId,
    charge,
    status: ded.ok ? 'OK' : 'INSUFFICIENT_BALANCE',
    errorMessage: ded.ok ? undefined : 'Saldo habis saat charge CS reply',
  })

  if (!ded.ok) {
    return { ok: false, insufficient: true, tokensCharged: charge.tokensCharged }
  }

  const balanceRow = await prisma.tokenBalance.findUnique({
    where: { userId: input.userId },
    select: { balance: true },
  })

  return {
    ok: true,
    tokensCharged: charge.tokensCharged,
    apiCostUsd: charge.apiCostUsd,
    apiCostRp: charge.apiCostRp,
    revenueRp: charge.revenueRp,
    profitRp: charge.profitRp,
    marginPct: charge.marginPct,
    balance: balanceRow?.balance ?? 0,
  }
}

/** Pre-flight cek saldo — estimasi kasar sebelum memanggil AI. */
export async function hasEnoughTokens(
  userId: string,
  amount: number,
): Promise<boolean> {
  const row = await prisma.tokenBalance.findUnique({
    where: { userId },
    select: { balance: true },
  })
  return (row?.balance ?? 0) >= amount
}
