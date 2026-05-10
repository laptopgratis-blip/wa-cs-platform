// ai-feature-sync.ts — sinkronisasi harga input/output dari AiModelPreset
// (sumber kebenaran harga API provider) ke AiFeatureConfig (config aktif yg
// dipakai service AI). Margin/floor/cap TIDAK ikut di-sync — itu per-feature
// admin tunable.
//
// Dipanggil:
//   1. Auto: setelah PATCH preset / apply-changes hasil AI research.
//   2. Manual: tombol "Sync dari preset" di /admin/ai-features (bulk).
//
// Match basis: AiFeatureConfig.modelName === AiModelPreset.modelId.
import { invalidateAiFeatureConfigCache } from '@/lib/services/ai-feature-config'
import { prisma } from '@/lib/prisma'

export interface SyncResult {
  /** Jumlah AiFeatureConfig yang ter-update (price-nya berubah). */
  synced: number
  /** Tidak ada perubahan (price config sudah sama dengan preset). */
  unchanged: number
  /** AiFeatureConfig ada tapi preset tidak ditemukan untuk modelName ini. */
  missing: string[]
}

/**
 * Sync semua AiFeatureConfig yang punya `modelName === modelId` ke harga
 * preset. Idempotent — kalau sudah sama, tidak update (skip).
 */
export async function syncFeatureConfigsFromPreset(
  modelId: string,
): Promise<SyncResult> {
  const preset = await prisma.aiModelPreset.findUnique({
    where: { modelId },
    select: { modelId: true, inputPricePer1M: true, outputPricePer1M: true },
  })
  if (!preset) {
    return { synced: 0, unchanged: 0, missing: [modelId] }
  }

  const matching = await prisma.aiFeatureConfig.findMany({
    where: { modelName: modelId },
    select: {
      id: true,
      inputPricePer1M: true,
      outputPricePer1M: true,
    },
  })

  let synced = 0
  let unchanged = 0
  for (const cfg of matching) {
    if (
      cfg.inputPricePer1M === preset.inputPricePer1M &&
      cfg.outputPricePer1M === preset.outputPricePer1M
    ) {
      unchanged++
      continue
    }
    await prisma.aiFeatureConfig.update({
      where: { id: cfg.id },
      data: {
        inputPricePer1M: preset.inputPricePer1M,
        outputPricePer1M: preset.outputPricePer1M,
      },
    })
    synced++
  }
  if (synced > 0) invalidateAiFeatureConfigCache()
  return { synced, unchanged, missing: [] }
}

/**
 * Bulk sync semua AiFeatureConfig — untuk tombol "Sync dari preset" admin.
 * Untuk setiap config, find preset by modelName, update kalau drift.
 * Return ringkasan total.
 */
export async function syncAllFeatureConfigsFromPresets(): Promise<SyncResult> {
  const configs = await prisma.aiFeatureConfig.findMany({
    select: {
      id: true,
      modelName: true,
      inputPricePer1M: true,
      outputPricePer1M: true,
    },
  })
  if (configs.length === 0) return { synced: 0, unchanged: 0, missing: [] }

  const modelNames = Array.from(new Set(configs.map((c) => c.modelName)))
  const presets = await prisma.aiModelPreset.findMany({
    where: { modelId: { in: modelNames } },
    select: {
      modelId: true,
      inputPricePer1M: true,
      outputPricePer1M: true,
    },
  })
  const presetByModel = new Map(presets.map((p) => [p.modelId, p]))

  const missing: string[] = []
  let synced = 0
  let unchanged = 0
  for (const cfg of configs) {
    const preset = presetByModel.get(cfg.modelName)
    if (!preset) {
      // Catat sebagai missing supaya admin tahu config yg model-nya tidak ada
      // di preset. Hindari duplikat.
      if (!missing.includes(cfg.modelName)) missing.push(cfg.modelName)
      continue
    }
    if (
      cfg.inputPricePer1M === preset.inputPricePer1M &&
      cfg.outputPricePer1M === preset.outputPricePer1M
    ) {
      unchanged++
      continue
    }
    await prisma.aiFeatureConfig.update({
      where: { id: cfg.id },
      data: {
        inputPricePer1M: preset.inputPricePer1M,
        outputPricePer1M: preset.outputPricePer1M,
      },
    })
    synced++
  }
  if (synced > 0) invalidateAiFeatureConfigCache()
  return { synced, unchanged, missing }
}

/**
 * Helper read-only — return drift detection per config tanpa mutate apa pun.
 * Dipakai di UI untuk highlight badge "drift" per row.
 */
export async function getFeatureConfigDriftMap(): Promise<
  Record<
    string,
    {
      modelName: string
      configInput: number
      configOutput: number
      presetInput: number | null
      presetOutput: number | null
      driftInput: boolean
      driftOutput: boolean
      presetMissing: boolean
    }
  >
> {
  const configs = await prisma.aiFeatureConfig.findMany({
    select: {
      id: true,
      modelName: true,
      inputPricePer1M: true,
      outputPricePer1M: true,
    },
  })
  if (configs.length === 0) return {}

  const modelNames = Array.from(new Set(configs.map((c) => c.modelName)))
  const presets = await prisma.aiModelPreset.findMany({
    where: { modelId: { in: modelNames } },
    select: {
      modelId: true,
      inputPricePer1M: true,
      outputPricePer1M: true,
    },
  })
  const presetByModel = new Map(presets.map((p) => [p.modelId, p]))

  const out: Record<
    string,
    {
      modelName: string
      configInput: number
      configOutput: number
      presetInput: number | null
      presetOutput: number | null
      driftInput: boolean
      driftOutput: boolean
      presetMissing: boolean
    }
  > = {}
  for (const cfg of configs) {
    const preset = presetByModel.get(cfg.modelName)
    out[cfg.id] = {
      modelName: cfg.modelName,
      configInput: cfg.inputPricePer1M,
      configOutput: cfg.outputPricePer1M,
      presetInput: preset?.inputPricePer1M ?? null,
      presetOutput: preset?.outputPricePer1M ?? null,
      driftInput: preset
        ? preset.inputPricePer1M !== cfg.inputPricePer1M
        : false,
      driftOutput: preset
        ? preset.outputPricePer1M !== cfg.outputPricePer1M
        : false,
      presetMissing: !preset,
    }
  }
  return out
}
