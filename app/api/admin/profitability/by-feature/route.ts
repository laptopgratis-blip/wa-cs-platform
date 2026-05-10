// GET /api/admin/profitability/by-feature?from=&to=
// Aggregate per AiFeatureConfig via AiGenerationLog (Content Studio dst).
// Beda dari /by-model yg query Message — log feature pakai tabel
// AiGenerationLog dengan field apiCostRp/revenueRp/profitRp tersnapshot
// saat AI call.
import { Prisma } from '@prisma/client'
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { getPricingSettings } from '@/lib/pricing-settings'
import { prisma } from '@/lib/prisma'
import { parseRange, statusOf } from '@/lib/profitability'

interface RawRow {
  featureKey: string
  count: bigint
  apiCostRp: number | null
  revenueRp: number | null
  profitRp: number | null
}

export async function GET(req: Request) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const { searchParams } = new URL(req.url)
    const { from, to } = parseRange(searchParams)
    const settings = await getPricingSettings()

    const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT
        log."featureKey" AS "featureKey",
        COUNT(*)::bigint AS "count",
        SUM(log."apiCostRp") AS "apiCostRp",
        SUM(log."revenueRp") AS "revenueRp",
        SUM(log."profitRp") AS "profitRp"
      FROM "AiGenerationLog" log
      WHERE log."status" = 'OK'
        AND log."createdAt" >= ${from} AND log."createdAt" < ${to}
      GROUP BY log."featureKey"
      ORDER BY SUM(log."profitRp") DESC NULLS LAST
    `)

    // Join displayName dari AiFeatureConfig untuk UI yg ramah.
    const featureKeys = rows.map((r) => r.featureKey)
    const configs = await prisma.aiFeatureConfig.findMany({
      where: { featureKey: { in: featureKeys } },
      select: { featureKey: true, displayName: true, modelName: true },
    })
    const byKey = new Map(configs.map((c) => [c.featureKey, c]))

    const data = rows.map((r) => {
      const apiCostRp = r.apiCostRp ?? 0
      const revenueRp = r.revenueRp ?? 0
      const profitRp = r.profitRp ?? 0
      const marginPct = revenueRp > 0 ? (profitRp / revenueRp) * 100 : 0
      const cfg = byKey.get(r.featureKey)
      return {
        featureKey: r.featureKey,
        displayName: cfg?.displayName ?? r.featureKey,
        modelName: cfg?.modelName ?? null,
        calls: Number(r.count),
        apiCostRp,
        revenueRp,
        profitRp,
        marginPct,
        status: statusOf(marginPct, settings.marginTarget),
      }
    })

    return jsonOk(data)
  } catch (err) {
    console.error('[GET /api/admin/profitability/by-feature] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
