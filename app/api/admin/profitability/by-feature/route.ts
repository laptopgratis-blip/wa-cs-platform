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
  // Model paling sering dipakai di periode ini (dari AiGenerationLog.modelName,
  // per-row aktual — bukan dari AiFeatureConfig snapshot).
  topModelName: string | null
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

    // Per-feature aggregate + top model dari AiGenerationLog.modelName aktual
    // (bukan AiFeatureConfig snapshot). Subquery hitung per (featureKey,
    // modelName), lalu pick yang count terbanyak dengan DISTINCT ON.
    const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
      WITH agg AS (
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
      ),
      top_model AS (
        SELECT DISTINCT ON ("featureKey")
          "featureKey",
          "modelName" AS "topModelName"
        FROM (
          SELECT
            log."featureKey",
            log."modelName",
            COUNT(*) AS uses
          FROM "AiGenerationLog" log
          WHERE log."status" = 'OK'
            AND log."createdAt" >= ${from} AND log."createdAt" < ${to}
          GROUP BY log."featureKey", log."modelName"
        ) s
        ORDER BY "featureKey", uses DESC
      )
      SELECT a.*, tm."topModelName"
      FROM agg a
      LEFT JOIN top_model tm USING ("featureKey")
      ORDER BY a."profitRp" DESC NULLS LAST
    `)

    // Join displayName dari AiFeatureConfig untuk UI yg ramah.
    const featureKeys = rows.map((r) => r.featureKey)
    const configs = await prisma.aiFeatureConfig.findMany({
      where: { featureKey: { in: featureKeys } },
      select: { featureKey: true, displayName: true },
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
        // Model paling sering dipakai di periode ini (real, bukan config).
        modelName: r.topModelName,
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
