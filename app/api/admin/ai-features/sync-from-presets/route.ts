// POST /api/admin/ai-features/sync-from-presets
// Bulk-sync semua AiFeatureConfig dari AiModelPreset terkini.
// Match: AiFeatureConfig.modelName === AiModelPreset.modelId.
// Return: { synced, unchanged, missing[] } — missing = modelName yg tidak
// punya preset (admin perlu add preset / fix modelName).
//
// GET — diagnostics: drift map current configs vs preset (read-only).
// Dipakai UI untuk badge "drift" per row di /admin/ai-features.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import {
  getFeatureConfigDriftMap,
  syncAllFeatureConfigsFromPresets,
} from '@/lib/services/ai-feature-sync'

export async function POST() {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const result = await syncAllFeatureConfigsFromPresets()
    return jsonOk(result)
  } catch (err) {
    console.error('[POST /api/admin/ai-features/sync-from-presets] gagal:', err)
    return jsonError(
      err instanceof Error ? err.message : 'Terjadi kesalahan server',
      500,
    )
  }
}

export async function GET() {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const drift = await getFeatureConfigDriftMap()
    return jsonOk({ drift })
  } catch (err) {
    console.error('[GET /api/admin/ai-features/sync-from-presets] gagal:', err)
    return jsonError(
      err instanceof Error ? err.message : 'Terjadi kesalahan server',
      500,
    )
  }
}
