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
//
// Skema fair-pricing: SEMUA fitur pakai margin 2.0 (2× cost provider),
// floor 10 (anti-mikro), capTokens 0 (tidak di-enforce). Editable per fitur
// di /admin/ai-features.
const COMMON_DEFAULTS = {
  modelName: 'claude-haiku-4-5',
  inputPricePer1M: 1.0,
  outputPricePer1M: 5.0,
  platformMargin: 2.0,
  floorTokens: 10,
  capTokens: 0,
  isActive: true,
} as const

const DEFAULTS: Record<string, Omit<AiFeatureConfigValues, 'id' | 'updatedAt'>> = {
  CONTENT_IDEA: {
    ...COMMON_DEFAULTS,
    featureKey: 'CONTENT_IDEA',
    displayName: 'Idea Generator',
    description: null,
  },
  CONTENT_GENERATE: {
    ...COMMON_DEFAULTS,
    featureKey: 'CONTENT_GENERATE',
    displayName: 'Content Generation',
    description: null,
  },
  KNOWLEDGE_KEYWORD_SUGGEST: {
    ...COMMON_DEFAULTS,
    featureKey: 'KNOWLEDGE_KEYWORD_SUGGEST',
    displayName: 'Optimasi Keyword Knowledge',
    description:
      'Generate 5 trigger keyword (sinonim, slang, keraguan customer) per klik. Dipanggil dari /knowledge form atau bulk optimasi.',
  },
  ADS_GENERATE: {
    ...COMMON_DEFAULTS,
    featureKey: 'ADS_GENERATE',
    displayName: 'Ads Creative Generator',
    description:
      'Generate creative iklan Meta/TikTok/Google Ads (headline, primary text, CTA).',
  },
  LP_GENERATE: {
    ...COMMON_DEFAULTS,
    featureKey: 'LP_GENERATE',
    displayName: 'LP Generate (HTML)',
    description:
      'Generate landing page HTML dari brief. Streaming response. Charge berdasarkan input/output token real.',
  },
  LP_OPTIMIZE: {
    ...COMMON_DEFAULTS,
    featureKey: 'LP_OPTIMIZE',
    modelName: 'claude-sonnet-4-6',
    inputPricePer1M: 3.0,
    outputPricePer1M: 15.0,
    displayName: 'LP Optimize (CRO)',
    description:
      'Optimasi CRO landing page pakai Claude Sonnet (model lebih besar). POWER tier only.',
  },
  SOUL_SIM: {
    ...COMMON_DEFAULTS,
    featureKey: 'SOUL_SIM',
    displayName: 'Soul Simulation',
    description:
      'Simulasi 2 AI (seller vs buyer) untuk test prompt. Multi-provider (Anthropic/OpenAI/Google) — pricing snapshot per-turn dari AiModel.',
  },
  CS_REPLY: {
    ...COMMON_DEFAULTS,
    featureKey: 'CS_REPLY',
    displayName: 'CS Reply WhatsApp',
    description:
      'Auto-balas chat customer di WhatsApp via AI. Charge proporsional input+output token real per balasan (bukan flat per-message).',
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
