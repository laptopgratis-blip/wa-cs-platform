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
  // Unit dasar charge — 'TOKEN' (default, AI text), 'IMAGE' (Gemini Nano
  // Banana per image), 'VIDEO_SECOND' (Kling per detik). Lihat helper
  // computeChargeFromUsage — semantik shift di caller, rumus identik.
  unitType: 'TOKEN' | 'IMAGE' | 'VIDEO_SECOND'
  unitLabel: string | null
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
  unitType: 'TOKEN' as const,
  unitLabel: null,
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
    displayName: 'LP Optimize (CRO)',
    description:
      'Optimasi CRO landing page. Pakai Haiku (cepat 200-300 tok/s) — Sonnet 3-5x lebih lambat untuk LP besar (output 15-30K token), UX buruk.',
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
  // CS Live AI host generation — Gemini Nano Banana 2 per image.
  // inputPricePer1M = USD per 1 image × 1_000_000 (Nano Banana 2 ≈ $0.045).
  HOST_IMAGE_GEMINI_NANO: {
    ...COMMON_DEFAULTS,
    featureKey: 'HOST_IMAGE_GEMINI_NANO',
    displayName: 'CS Live AI — Host Image (Gemini Nano Banana 2)',
    modelName: 'gemini-3.1-flash-image-preview',
    inputPricePer1M: 45_000, // $0.045/image × 1M
    outputPricePer1M: 0,
    floorTokens: 200,
    unitType: 'IMAGE' as const,
    unitLabel: 'image',
    description:
      'Generate gambar host (avatar) untuk CS Live AI. 1 call = 1 image. Cost ≈ $0.045/image (Nano Banana 2, 1K res).',
  },
  // Kling video generation — biaya per detik.
  // inputPricePer1M = USD per 1 detik × 1_000_000 (Kling v2.1 master ≈ $0.10/sec via Fal.ai).
  HOST_VIDEO_KLING_V3: {
    ...COMMON_DEFAULTS,
    featureKey: 'HOST_VIDEO_KLING_V3',
    displayName: 'CS Live AI — Host Video (Kling)',
    modelName: 'fal-ai/kling-video/v2.1/master/image-to-video',
    inputPricePer1M: 100_000, // $0.10/sec × 1M
    outputPricePer1M: 0,
    floorTokens: 500,
    unitType: 'VIDEO_SECOND' as const,
    unitLabel: 'detik',
    description:
      'Animasikan gambar host jadi MP4 looping. Biaya per detik video. Async — submit → poll → download (24h URL expiry).',
  },
  // KLIP LIVE MODE (Sprint 5+, 2026-06-02) — per-stage billing pipeline.
  // Kalkulator + profitability page otomatis pickup ini via AiFeatureConfig table.
  KLIP_LIVE_LIPSYNC: {
    ...COMMON_DEFAULTS,
    featureKey: 'KLIP_LIVE_LIPSYNC',
    displayName: 'Klip Live — Kling Lip-Sync',
    modelName: 'kling-lip-sync',
    inputPricePer1M: 100_000, // $0.10/sec output × 1M
    outputPricePer1M: 0,
    floorTokens: 200,
    unitType: 'VIDEO_SECOND' as const,
    unitLabel: 'detik',
    description:
      'Kling lipsync video per detik output. Pakai baseline videoId existing (gak charge image2video lagi).',
  },
  KLIP_LIVE_TTS_ELEVENLABS: {
    ...COMMON_DEFAULTS,
    featureKey: 'KLIP_LIVE_TTS_ELEVENLABS',
    displayName: 'Klip Live — ElevenLabs TTS',
    modelName: 'eleven_multilingual_v2',
    inputPricePer1M: 30, // $30/1M char = $0.00003/char
    outputPricePer1M: 0,
    floorTokens: 30,
    unitType: 'TOKEN' as const,
    unitLabel: 'character',
    description:
      'ElevenLabs TTS Indonesian native. Cost ~$0.015/1k char. Per klip 50-150 char.',
  },
  KLIP_LIVE_VISION: {
    ...COMMON_DEFAULTS,
    featureKey: 'KLIP_LIVE_VISION',
    displayName: 'Klip Live — Vision Analyzer',
    modelName: 'claude-haiku-4-5',
    inputPricePer1M: 1, // input price Claude Haiku 4.5
    outputPricePer1M: 5,
    floorTokens: 100,
    unitType: 'TOKEN' as const,
    description:
      'Claude Haiku Vision analyze host image — sekali per host setup, dipakai untuk adaptive Kling prompt.',
  },
  KLIP_LIVE_SCRIPT_SUGGEST: {
    ...COMMON_DEFAULTS,
    featureKey: 'KLIP_LIVE_SCRIPT_SUGGEST',
    displayName: 'Klip Live — Script Suggester (AI)',
    modelName: 'claude-haiku-4-5',
    inputPricePer1M: 1,
    outputPricePer1M: 5,
    floorTokens: 100,
    unitType: 'TOKEN' as const,
    description:
      'Claude Haiku bulk suggest scripts (5-20 per call). User edit lalu approve sebelum generate.',
  },
  KLIP_LIVE_TRIGGER_SUGGEST: {
    ...COMMON_DEFAULTS,
    featureKey: 'KLIP_LIVE_TRIGGER_SUGGEST',
    displayName: 'Klip Live — Trigger Suggester (AI)',
    modelName: 'claude-haiku-4-5',
    inputPricePer1M: 1,
    outputPricePer1M: 5,
    floorTokens: 50,
    unitType: 'TOKEN' as const,
    description:
      'Claude Haiku generate 5-10 trigger phrase per klip (literal + keraguan customer). Owner klik "Optimasi AI" di Edit Klip.',
  },
  KLIP_LIVE_EMBED: {
    ...COMMON_DEFAULTS,
    featureKey: 'KLIP_LIVE_EMBED',
    displayName: 'Klip Live — Embedding (OpenAI)',
    modelName: 'text-embedding-3-small',
    inputPricePer1M: 20, // $0.02/1M token = $20/1M
    outputPricePer1M: 0,
    floorTokens: 5,
    unitType: 'TOKEN' as const,
    unitLabel: 'token',
    description:
      'OpenAI embedding per klip transcript untuk cosine match saat live. Negligible cost.',
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
      unitType: (row.unitType as 'TOKEN' | 'IMAGE' | 'VIDEO_SECOND') ?? 'TOKEN',
      unitLabel: row.unitLabel ?? null,
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
