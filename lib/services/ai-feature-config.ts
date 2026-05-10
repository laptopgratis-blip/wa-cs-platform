// Helper akses AiFeatureConfig (per-feature pricing config admin-tunable).
// Cache 60 detik per featureKey supaya tidak hit DB tiap AI call.
//
// Pakai di service Content Studio + future LP Lab migration. Admin update
// nilai via /admin/ai-pricing → effect setelah max 60 detik (cache TTL).
//
// Pattern mirror lib/pricing-settings.ts.
import { prisma } from '@/lib/prisma'

export interface AiFeatureConfigValues {
  id: string
  featureKey: string
  displayName: string
  modelName: string
  inputPricePer1M: number
  outputPricePer1M: number
  platformMargin: number
  floorTokens: number
  capTokens: number
  isActive: boolean
  description: string | null
  updatedAt: Date
}

const TTL_MS = 60_000
const cache = new Map<string, { value: AiFeatureConfigValues; cachedAt: number }>()

// Default config kalau row di DB belum ada — fallback defensif supaya
// service tidak crash kalau migration belum di-seed.
const DEFAULTS: Record<string, Omit<AiFeatureConfigValues, 'id' | 'updatedAt'>> = {
  CONTENT_IDEA: {
    featureKey: 'CONTENT_IDEA',
    displayName: 'Idea Generator',
    modelName: 'claude-haiku-4-5',
    inputPricePer1M: 1.0,
    outputPricePer1M: 5.0,
    platformMargin: 1.3,
    floorTokens: 100,
    capTokens: 50_000,
    isActive: true,
    description: null,
  },
  CONTENT_GENERATE: {
    featureKey: 'CONTENT_GENERATE',
    displayName: 'Content Generation',
    modelName: 'claude-haiku-4-5',
    inputPricePer1M: 1.0,
    outputPricePer1M: 5.0,
    platformMargin: 1.3,
    floorTokens: 200,
    capTokens: 100_000,
    isActive: true,
    description: null,
  },
}

export async function getAiFeatureConfig(
  featureKey: string,
): Promise<AiFeatureConfigValues> {
  const now = Date.now()
  const cached = cache.get(featureKey)
  if (cached && now - cached.cachedAt < TTL_MS) {
    return cached.value
  }

  const row = await prisma.aiFeatureConfig.findUnique({
    where: { featureKey },
  })
  if (row) {
    const value: AiFeatureConfigValues = {
      id: row.id,
      featureKey: row.featureKey,
      displayName: row.displayName,
      modelName: row.modelName,
      inputPricePer1M: row.inputPricePer1M,
      outputPricePer1M: row.outputPricePer1M,
      platformMargin: row.platformMargin,
      floorTokens: row.floorTokens,
      capTokens: row.capTokens,
      isActive: row.isActive,
      description: row.description,
      updatedAt: row.updatedAt,
    }
    cache.set(featureKey, { value, cachedAt: now })
    return value
  }

  // Fallback ke default kalau row belum di-seed.
  const def = DEFAULTS[featureKey]
  if (!def) {
    throw new Error(
      `AiFeatureConfig untuk featureKey="${featureKey}" tidak ada & tidak ada default. Seed via migration.`,
    )
  }
  const value: AiFeatureConfigValues = {
    id: `fallback_${featureKey}`,
    ...def,
    updatedAt: new Date(0),
  }
  cache.set(featureKey, { value, cachedAt: now })
  return value
}

export function invalidateAiFeatureConfigCache(featureKey?: string): void {
  if (featureKey) cache.delete(featureKey)
  else cache.clear()
}
