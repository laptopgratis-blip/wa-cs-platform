// Helper hitung token charge dari Anthropic usage real + log ke
// AiGenerationLog. Source of truth untuk profitability tracking semua AI
// feature (Content Studio, future LP Lab migration).
//
// Pattern mirror lp-optimize.ts cost calc, tapi pakai AiFeatureConfig
// (admin-tunable di DB) bukan hardcoded constant.
import { randomUUID } from 'node:crypto'

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

// Override provider pricing per-call. Dipakai oleh fitur yang model-nya
// dipilih user (CS Reply WA, Soul Simulation) — modelName + harga input/output
// per 1M USD diambil dari AiModel record, bukan dari AiFeatureConfig. Margin,
// floor, cap tetap dari AiFeatureConfig (sumber kebenaran admin).
export interface PriceOverride {
  modelName: string
  inputPricePer1M: number
  outputPricePer1M: number
}

// Hitung charge dari usage real Anthropic. Caller pakai hasil ini untuk
// atomic deduct di prisma.tokenBalance.updateMany + log ke AiGenerationLog.
export async function computeChargeFromUsage(input: {
  featureKey: string
  inputTokens: number
  outputTokens: number
  priceOverride?: PriceOverride
}): Promise<ComputedCharge> {
  const config = await getAiFeatureConfig(input.featureKey)
  const pricing = await getPricingSettings()

  const inputPricePer1M =
    input.priceOverride?.inputPricePer1M ?? config.inputPricePer1M
  const outputPricePer1M =
    input.priceOverride?.outputPricePer1M ?? config.outputPricePer1M
  const modelName = input.priceOverride?.modelName ?? config.modelName

  const apiCostUsd =
    (input.inputTokens / 1_000_000) * inputPricePer1M +
    (input.outputTokens / 1_000_000) * outputPricePer1M
  const apiCostRp = apiCostUsd * pricing.usdRate

  // Platform charge: providerCostRp × margin / pricePerToken → ceil ke token.
  // Floor ≥ floorTokens (anti-mikro). NO cap — pure proportional supaya
  // platform tidak rugi saat output AI besar. capTokens disimpan di snapshot
  // untuk audit historis tapi tidak di-enforce.
  const rawCharge = (apiCostRp * config.platformMargin) / pricing.pricePerToken
  const tokensCharged = Math.max(config.floorTokens, Math.ceil(rawCharge))
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
    modelName,
    pricingSnapshot: {
      inputPricePer1M,
      outputPricePer1M,
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
  priceOverride?: PriceOverride
}): Promise<ComputedCharge> {
  return computeChargeFromUsage({
    featureKey: input.featureKey,
    inputTokens: input.estimatedInputTokens,
    outputTokens: input.estimatedOutputTokens,
    priceOverride: input.priceOverride,
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
//
// IMPORTANT: TokenTransaction punya UNIQUE constraint (userId, reference, type).
// Untuk hindari race condition (mis. caller pass `Date.now()` ms collision)
// kita SELALU append randomUUID() ke reference internal. Caller pass prefix
// yang readable (`kb_suggest`, `content_idea`, etc), helper jamin uniqueness.
export async function deductTokenAtomic(input: {
  userId: string
  tokensCharged: number
  description: string
  reference: string
}): Promise<{ ok: boolean }> {
  // Always suffix with UUID to make reference globally unique.
  const uniqueReference = `${input.reference}:${randomUUID()}`
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
        reference: uniqueReference,
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

// ─── executeAiWithCharge ────────────────────────────────────────────────
// Wrapper untuk memastikan tiap AI call WAJIB tercatat & ter-charge.
// Caller kasih: featureKey, userId, estimasi token, dan async function yg
// panggil Anthropic. Helper handle balance check + deduct + log untuk:
//   - sukses
//   - AI throw exception (FAILED log, no deduct karena AI tidak terpakai)
//   - response handler throw exception SETELAH AI call (FAILED log + DEDUCT karena cost real ke Anthropic sudah keluar)
//   - balance kurang sebelum AI (INSUFFICIENT_BALANCE log, no deduct, no AI)
//   - balance turun mid-flow (INSUFFICIENT_BALANCE log setelah AI — kasus race)
//
// Caller WAJIB return real usage (input/output tokens dari response.usage).
// Untuk endpoint multi-AI (e.g., bulk parallel call), wrap per-call.
//
// Throws Error 'INSUFFICIENT_BALANCE' kalau balance kurang.
// Throws Error apa-pun yg di-throw oleh aiCall (caller harus handle).
// Sukses → return whatever aiCall returns.

export interface AiCallContext<T> {
  // Stable identifier (e.g., featureKey + subjectId) — UUID suffix di-tambah oleh helper.
  referencePrefix: string
  // Description user-readable di TokenTransaction (e.g., "Optimasi Keyword Knowledge").
  description: string
  // Subject untuk audit AiGenerationLog (e.g., 'KNOWLEDGE', 'LP', 'CONTENT_IDEA').
  subjectType?: string
  subjectId?: string
  // Estimasi worst-case untuk pre-flight check. Helper computeCharge dari ini.
  estimateInputTokens: number
  estimateOutputTokens: number
  // Optional: override harga provider per-call (untuk fitur yang model-nya
  // dipilih user, mis. CS Reply WA, Soul Simulation). Margin/floor/cap tetap
  // dari AiFeatureConfig.
  priceOverride?: PriceOverride
  // Fungsi yg panggil AI Anthropic, return { result, inputTokens, outputTokens }.
  // result generic — caller pakai untuk parse/transform.
  aiCall: () => Promise<{ result: T; inputTokens: number; outputTokens: number }>
}

export class InsufficientBalanceError extends Error {
  tokensRequired: number
  constructor(tokensRequired: number) {
    super(`Saldo token kurang. Butuh ±${tokensRequired} token.`)
    this.name = 'InsufficientBalanceError'
    this.tokensRequired = tokensRequired
  }
}

export async function executeAiWithCharge<T>(input: {
  featureKey: string
  userId: string
  ctx: AiCallContext<T>
}): Promise<{ result: T; charge: ComputedCharge }> {
  const { featureKey, userId, ctx } = input

  // Step 1: pre-flight balance check.
  const preCheck = await computeChargeFromUsage({
    featureKey,
    inputTokens: ctx.estimateInputTokens,
    outputTokens: ctx.estimateOutputTokens,
    priceOverride: ctx.priceOverride,
  })
  const enough = await hasEnoughBalance(userId, preCheck.tokensCharged)
  if (!enough) {
    await logGeneration({
      featureKey,
      userId,
      subjectType: ctx.subjectType,
      subjectId: ctx.subjectId,
      charge: {
        ...preCheck,
        inputTokens: 0,
        outputTokens: 0,
        apiCostUsd: 0,
        apiCostRp: 0,
        revenueRp: 0,
        profitRp: 0,
        marginPct: 0,
      },
      status: 'INSUFFICIENT_BALANCE',
      errorMessage: `Saldo kurang. Butuh ±${preCheck.tokensCharged} token`,
    })
    throw new InsufficientBalanceError(preCheck.tokensCharged)
  }

  // Step 2: panggil AI. Kalau throw, log FAILED tanpa deduct (cost belum ter-bill ke Anthropic kecuali response sukses).
  let aiResult: { result: T; inputTokens: number; outputTokens: number }
  try {
    aiResult = await ctx.aiCall()
  } catch (err) {
    await logGeneration({
      featureKey,
      userId,
      subjectType: ctx.subjectType,
      subjectId: ctx.subjectId,
      charge: {
        ...preCheck,
        inputTokens: 0,
        outputTokens: 0,
        apiCostUsd: 0,
        apiCostRp: 0,
        revenueRp: 0,
        profitRp: 0,
        marginPct: 0,
      },
      status: 'FAILED',
      errorMessage: `AI call gagal: ${(err as Error).message.slice(0, 200)}`,
    })
    throw err
  }

  // Step 3: compute real charge dari usage Anthropic.
  const charge = await computeChargeFromUsage({
    featureKey,
    inputTokens: aiResult.inputTokens,
    outputTokens: aiResult.outputTokens,
    priceOverride: ctx.priceOverride,
  })

  // Step 4: deduct + log. WAJIB jalan walau caller eror handle.
  const dedRes = await deductTokenAtomic({
    userId,
    tokensCharged: charge.tokensCharged,
    description: ctx.description,
    reference: ctx.referencePrefix,
  })
  await logGeneration({
    featureKey,
    userId,
    subjectType: ctx.subjectType,
    subjectId: ctx.subjectId,
    charge,
    status: dedRes.ok ? 'OK' : 'INSUFFICIENT_BALANCE',
    errorMessage: dedRes.ok ? undefined : 'Race: saldo turun mid-flow',
  })
  if (!dedRes.ok) {
    throw new InsufficientBalanceError(charge.tokensCharged)
  }

  return { result: aiResult.result, charge }
}
