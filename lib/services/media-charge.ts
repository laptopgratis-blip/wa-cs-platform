// Token deduction untuk fitur media (image / video). Parallel ke
// executeAiWithCharge tapi unit-based: caller pass `units` (jumlah image
// atau detik video) — helper interpret sesuai AiFeatureConfig.unitType.
//
// Rumus identik dengan computeChargeFromUsage. Untuk media:
//   apiCostUsd = (units / 1_000_000) × inputPricePer1M
// karena admin menyimpan `inputPricePer1M` sebagai "USD per 1 unit × 1_000_000"
// (mis. Gemini Nano Banana 2 = 0.045 USD/image → field disimpan 45000).
//
// Image (Gemini) = sync → executeMediaSync (balance check → call → deduct).
// Video (Kling) = async → reserveMediaCharge (pre-flight) +
// settleMediaCharge (di cron poll saat DONE).

import {
  deductTokenAtomic,
  hasEnoughBalance,
  InsufficientBalanceError,
  logGeneration,
  type ComputedCharge,
} from '@/lib/services/ai-generation-log'
import { getAiFeatureConfig } from '@/lib/services/ai-feature-config'
import { getPricingSettings } from '@/lib/pricing-settings'

export type MediaUnitType = 'IMAGE' | 'VIDEO_SECOND'

// Hitung charge untuk media. Mirror computeChargeFromUsage tapi caller pass
// `units` (jumlah image atau durasi detik). outputTokens=0 karena media tidak
// punya konsep input/output token — semua biaya di "input" side.
export async function computeMediaCharge(input: {
  featureKey: string
  units: number
}): Promise<ComputedCharge> {
  const config = await getAiFeatureConfig(input.featureKey)
  const pricing = await getPricingSettings()

  // (units / 1M) × pricePer1M = USD cost.
  const apiCostUsd = (input.units / 1_000_000) * config.inputPricePer1M
  const apiCostRp = apiCostUsd * pricing.usdRate
  const rawCharge = (apiCostRp * config.platformMargin) / pricing.pricePerToken
  const tokensCharged = Math.max(config.floorTokens, Math.ceil(rawCharge))
  const revenueRp = tokensCharged * pricing.pricePerToken
  const profitRp = revenueRp - apiCostRp
  const marginPct = revenueRp > 0 ? (profitRp / revenueRp) * 100 : 0

  return {
    // inputTokens dipakai sebagai "units" — semantic re-use supaya
    // AiGenerationLog & dashboard profitability kompatibel tanpa migrate.
    inputTokens: input.units,
    outputTokens: 0,
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

// ── SYNC (image) ─────────────────────────────────────────────────────────
// Wrapper untuk fitur sync (Gemini image gen): balance check → call → deduct
// + log. Throws InsufficientBalanceError kalau saldo kurang. Throws apapun
// yg di-throw mediaCall.
export interface MediaSyncCtx<T> {
  referencePrefix: string
  description: string
  subjectType?: string
  subjectId?: string
  // Untuk image: 1 (per call = 1 image). Untuk video sync (rare): durasi detik.
  units: number
  mediaCall: () => Promise<T>
}

export async function executeMediaSync<T>(input: {
  featureKey: string
  userId: string
  ctx: MediaSyncCtx<T>
}): Promise<{ result: T; charge: ComputedCharge }> {
  const { featureKey, userId, ctx } = input

  const charge = await computeMediaCharge({
    featureKey,
    units: ctx.units,
  })

  const enough = await hasEnoughBalance(userId, charge.tokensCharged)
  if (!enough) {
    await logGeneration({
      featureKey,
      userId,
      subjectType: ctx.subjectType,
      subjectId: ctx.subjectId,
      charge,
      status: 'INSUFFICIENT_BALANCE',
      errorMessage: `Saldo kurang. Butuh ±${charge.tokensCharged} token`,
    })
    throw new InsufficientBalanceError(charge.tokensCharged)
  }

  let result: T
  try {
    result = await ctx.mediaCall()
  } catch (err) {
    await logGeneration({
      featureKey,
      userId,
      subjectType: ctx.subjectType,
      subjectId: ctx.subjectId,
      charge,
      status: 'FAILED',
      errorMessage: `Media call gagal: ${(err as Error).message.slice(0, 200)}`,
    })
    throw err
  }

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
  return { result, charge }
}

// ── ASYNC (video) ────────────────────────────────────────────────────────
// Video (Kling) submit → polling 24h URL → download. Charge baru di-deduct
// SAAT DONE (sukses + file ter-download). Caller pre-check via
// `assertVideoBudgetOk` sebelum submit supaya gak boncos kalau saldo kurang.

export async function assertVideoBudgetOk(input: {
  featureKey: string
  userId: string
  seconds: number
}): Promise<ComputedCharge> {
  const charge = await computeMediaCharge({
    featureKey: input.featureKey,
    units: input.seconds,
  })
  const enough = await hasEnoughBalance(input.userId, charge.tokensCharged)
  if (!enough) {
    throw new InsufficientBalanceError(charge.tokensCharged)
  }
  return charge
}

// Catatan: settle charge video kini di settleVideoChargeIdempotent
// (lib/services/host-gen/queue.ts) — reference deterministik per job id
// supaya poller dobel tidak double-charge. Varian lama (non-idempotent,
// suffix UUID) sengaja dihapus dari sini agar tidak terpakai lagi.

export { InsufficientBalanceError }
