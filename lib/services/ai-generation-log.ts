// Helper hitung token charge dari Anthropic usage real + log ke
// AiGenerationLog. Source of truth untuk profitability tracking semua AI
// feature (Content Studio, future LP Lab migration).
//
// Pattern mirror lp-optimize.ts cost calc, tapi pakai AiFeatureConfig
// (admin-tunable di DB) bukan hardcoded constant.
import { prisma } from '@/lib/prisma'
import { getPricingSettings } from '@/lib/pricing-settings'

import {
  type AiFeatureConfigValues,
  getAiFeatureConfig,
} from './ai-feature-config'

export interface ComputedCharge {
  inputTokens: number
  outputTokens: number
  apiCostUsd: number
  apiCostRp: number
  // Token platform yg di-deduct dari user.
  tokensCharged: number
  // Pendapatan IDR (kotor).
  revenueRp: number
  // Profit IDR — bisa negatif (loss).
  profitRp: number
  marginPct: number
  modelName: string
  // Snapshot config + pricing — audit trail.
  pricingSnapshot: {
    inputPricePer1M: number
    outputPricePer1M: number
    platformMargin: number
    floorTokens: number
    capTokens: number
    usdRate: number
    pricePerToken: number
  }
}

// Hitung charge dari usage real Anthropic. Caller pakai hasil ini untuk
// atomic deduct di prisma.tokenBalance.updateMany + log ke AiGenerationLog.
export async function computeChargeFromUsage(input: {
  featureKey: string
  inputTokens: number
  outputTokens: number
}): Promise<ComputedCharge> {
  const config = await getAiFeatureConfig(input.featureKey)
  const pricing = await getPricingSettings()

  const apiCostUsd =
    (input.inputTokens / 1_000_000) * config.inputPricePer1M +
    (input.outputTokens / 1_000_000) * config.outputPricePer1M
  const apiCostRp = apiCostUsd * pricing.usdRate

  // Platform charge: providerCostRp × margin / pricePerToken → ceil ke token.
  // Floor ≥ floorTokens, cap ≤ capTokens.
  const rawCharge = (apiCostRp * config.platformMargin) / pricing.pricePerToken
  const tokensCharged = Math.min(
    config.capTokens,
    Math.max(config.floorTokens, Math.ceil(rawCharge)),
  )
  const revenueRp = tokensCharged * pricing.pricePerToken
  const profitRp = revenueRp - apiCostRp
  const marginPct = revenueRp > 0 ? (profitRp / revenueRp) * 100 : 0

  return {
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    apiCostUsd,
    apiCostRp,
    tokensCharged,
    revenueRp,
    profitRp,
    marginPct,
    modelName: config.modelName,
    pricingSnapshot: {
      inputPricePer1M: config.inputPricePer1M,
      outputPricePer1M: config.outputPricePer1M,
      platformMargin: config.platformMargin,
      floorTokens: config.floorTokens,
      capTokens: config.capTokens,
      usdRate: pricing.usdRate,
      pricePerToken: pricing.pricePerToken,
    },
  }
}

// Pre-flight estimate untuk display "estimasi cost ke user" sebelum AI call.
// Caller estimasi inputTokens (dari prompt length / context) + expectedOutput.
export async function estimateCharge(input: {
  featureKey: string
  estimatedInputTokens: number
  estimatedOutputTokens: number
}): Promise<ComputedCharge> {
  return computeChargeFromUsage({
    featureKey: input.featureKey,
    inputTokens: input.estimatedInputTokens,
    outputTokens: input.estimatedOutputTokens,
  })
}

// Log AI call ke AiGenerationLog. Pisah dari deduct supaya caller bisa
// log juga kasus FAILED (AI throw, no deduct) untuk audit.
export async function logGeneration(input: {
  featureKey: string
  userId: string
  subjectType?: string
  subjectId?: string
  charge: ComputedCharge
  status?: 'OK' | 'FAILED' | 'INSUFFICIENT_BALANCE'
  errorMessage?: string
}): Promise<void> {
  await prisma.aiGenerationLog.create({
    data: {
      featureKey: input.featureKey,
      userId: input.userId,
      subjectType: input.subjectType ?? null,
      subjectId: input.subjectId ?? null,
      inputTokens: input.charge.inputTokens,
      outputTokens: input.charge.outputTokens,
      apiCostUsd: input.charge.apiCostUsd,
      apiCostRp: input.charge.apiCostRp,
      tokensCharged: input.charge.tokensCharged,
      revenueRp: input.charge.revenueRp,
      profitRp: input.charge.profitRp,
      marginPct: input.charge.marginPct,
      modelName: input.charge.modelName,
      pricingSnapshot: input.charge.pricingSnapshot,
      status: input.status ?? 'OK',
      errorMessage: input.errorMessage ?? null,
    },
  })
}

// Pre-flight balance check + atomic deduct setelah AI sukses. Pattern
// mirror app/api/lp/[lpId]/optimize/route.ts. Return null kalau race
// condition (saldo turun mid-flow), caller handle error friendly.
export async function deductTokenAtomic(input: {
  userId: string
  tokensCharged: number
  description: string
  reference: string
}): Promise<{ ok: boolean }> {
  return prisma.$transaction(async (tx) => {
    const result = await tx.tokenBalance.updateMany({
      where: {
        userId: input.userId,
        balance: { gte: input.tokensCharged },
      },
      data: {
        balance: { decrement: input.tokensCharged },
        totalUsed: { increment: input.tokensCharged },
      },
    })
    if (result.count === 0) return { ok: false }
    await tx.tokenTransaction.create({
      data: {
        userId: input.userId,
        amount: -input.tokensCharged,
        type: 'USAGE',
        description: input.description,
        reference: input.reference,
      },
    })
    return { ok: true }
  })
}

// Pre-flight cek apakah user punya saldo cukup. Bukan reservation — race
// dengan deduct atomic mungkin terjadi kalau user concurrent. Caller
// harus tetap handle race di deduct.
export async function hasEnoughBalance(
  userId: string,
  tokensRequired: number,
): Promise<boolean> {
  const balance = await prisma.tokenBalance.findUnique({
    where: { userId },
    select: { balance: true },
  })
  return (balance?.balance ?? 0) >= tokensRequired
}

export { type AiFeatureConfigValues }
