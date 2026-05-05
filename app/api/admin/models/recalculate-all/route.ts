// POST /api/admin/models/recalculate-all
// Loop semua AiModel dengan costMode='AUTO' dan re-hitung costPerMessage
// pakai PricingSettings terkini. Model dengan costMode='MANUAL' di-skip.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import {
  calcApiCostRp,
  calcRecommendedTokens,
  getPricingSettings,
} from '@/lib/pricing-settings'
import { prisma } from '@/lib/prisma'

export async function POST() {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const settings = await getPricingSettings()
    const models = await prisma.aiModel.findMany({
      where: { costMode: 'AUTO' },
    })

    let updated = 0
    let skipped = 0
    for (const m of models) {
      const apiCostRp = calcApiCostRp(
        settings.estimatedInputTokens,
        settings.estimatedOutputTokens,
        m.inputPricePer1M,
        m.outputPricePer1M,
        settings.usdRate,
      )
      const recommended = calcRecommendedTokens(
        apiCostRp,
        settings.pricePerToken,
        settings.marginTarget,
      )
      if (recommended <= 0) {
        skipped++
        continue
      }
      if (recommended === m.costPerMessage) {
        skipped++
        continue
      }
      await prisma.aiModel.update({
        where: { id: m.id },
        data: { costPerMessage: recommended },
      })
      updated++
    }
    return jsonOk({ updated, skipped, total: models.length })
  } catch (err) {
    console.error('[POST /api/admin/models/recalculate-all] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
