// GET /api/admin/ai-pricing/presets — list semua preset + freshness status
// computed dari lastUpdatedAt.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'

const VERIFIED_THRESHOLD_DAYS = 7
const STALE_THRESHOLD_DAYS = 30

function daysSince(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000))
}

function freshness(days: number): 'verified' | 'stale' | 'outdated' {
  if (days <= VERIFIED_THRESHOLD_DAYS) return 'verified'
  if (days <= STALE_THRESHOLD_DAYS) return 'stale'
  return 'outdated'
}

export async function GET() {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const rows = await prisma.aiModelPreset.findMany({
      orderBy: [{ provider: 'asc' }, { displayName: 'asc' }],
    })
    const data = rows.map((r) => {
      const days = daysSince(r.lastUpdatedAt)
      return {
        id: r.id,
        provider: r.provider,
        modelId: r.modelId,
        displayName: r.displayName,
        inputPricePer1M: r.inputPricePer1M,
        outputPricePer1M: r.outputPricePer1M,
        contextWindow: r.contextWindow,
        isAvailable: r.isAvailable,
        notes: r.notes,
        lastUpdatedSource: r.lastUpdatedSource,
        lastUpdatedAt: r.lastUpdatedAt.toISOString(),
        daysSinceUpdate: days,
        freshnessStatus: freshness(days),
      }
    })
    return jsonOk(data)
  } catch (err) {
    console.error('[GET /api/admin/ai-pricing/presets] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
