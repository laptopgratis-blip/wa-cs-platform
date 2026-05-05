// Helper akses PricingSettings (singleton). Cache di memory selama 60 detik
// supaya tidak hit DB per pesan saat wa-service / dashboard panggil.
//
// Bukan dipakai langsung dari wa-service (yang ada di service terpisah) —
// modul ini cuma untuk Next.js. wa-service ambil settings via internal API.
import { prisma } from '@/lib/prisma'

export interface PricingValues {
  id: string
  marginTarget: number
  estimatedInputTokens: number
  estimatedOutputTokens: number
  usdRate: number
  pricePerToken: number
  updatedAt: Date
}

const TTL_MS = 60_000
let cache: { value: PricingValues; cachedAt: number } | null = null

export const DEFAULT_PRICING: PricingValues = {
  id: 'default',
  marginTarget: 50,
  estimatedInputTokens: 1600,
  estimatedOutputTokens: 300,
  usdRate: 16000,
  pricePerToken: 2,
  updatedAt: new Date(0),
}

export async function getPricingSettings(): Promise<PricingValues> {
  if (cache && Date.now() - cache.cachedAt < TTL_MS) {
    return cache.value
  }
  // Singleton — selalu ambil 1 row pertama. Migration sudah seed satu row
  // dengan id='default'.
  const row = await prisma.pricingSettings.findFirst()
  const value: PricingValues = row
    ? {
        id: row.id,
        marginTarget: row.marginTarget,
        estimatedInputTokens: row.estimatedInputTokens,
        estimatedOutputTokens: row.estimatedOutputTokens,
        usdRate: row.usdRate,
        pricePerToken: row.pricePerToken,
        updatedAt: row.updatedAt,
      }
    : DEFAULT_PRICING
  cache = { value, cachedAt: Date.now() }
  return value
}

export function invalidatePricingCache(): void {
  cache = null
}

// ─── Helper hitung biaya & token rekomendasi ─────────────────────────
// Dipakai di banyak tempat (model form preview, recalc-all, dashboard).

export interface CostBreakdown {
  apiCostRp: number
  revenueRp: number
  profitRp: number
  marginPct: number
  status: 'AMAN' | 'TIPIS' | 'RUGI'
}

export function calcApiCostRp(
  inputTokens: number,
  outputTokens: number,
  inputPricePer1M: number,
  outputPricePer1M: number,
  usdRate: number,
): number {
  const usd =
    (inputTokens * inputPricePer1M + outputTokens * outputPricePer1M) /
    1_000_000
  return usd * usdRate
}

export function calcRecommendedTokens(
  apiCostRp: number,
  pricePerToken: number,
  marginTargetPct: number,
): number {
  const target = marginTargetPct / 100
  if (pricePerToken <= 0 || target >= 1 || target < 0) return 0
  return Math.max(1, Math.ceil(apiCostRp / pricePerToken / (1 - target)))
}

export function calcBreakdown(
  apiCostRp: number,
  tokensCharged: number,
  pricePerToken: number,
  marginTargetPct: number,
): CostBreakdown {
  const revenueRp = tokensCharged * pricePerToken
  const profitRp = revenueRp - apiCostRp
  const marginPct = revenueRp > 0 ? (profitRp / revenueRp) * 100 : -Infinity
  let status: CostBreakdown['status']
  if (marginPct >= marginTargetPct) status = 'AMAN'
  else if (marginPct >= 20) status = 'TIPIS'
  else status = 'RUGI'
  return { apiCostRp, revenueRp, profitRp, marginPct, status }
}
