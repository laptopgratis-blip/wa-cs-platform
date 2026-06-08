// GET /api/admin/token-cost/summary?from=&to=
// Monitoring biaya AI — SUMBER TUNGGAL: AiGenerationLog (semua fitur termasuk
// CS Reply WA). Return: total spend (USD+Rp), token, revenue, profit +
// breakdown per PROVIDER + per FITUR/MODEL + timeline harian per provider.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { parseRange } from '@/lib/profitability'
import { prisma } from '@/lib/prisma'

interface ProviderRow {
  provider: string
  calls: number
  apiCostUsd: number
  apiCostRp: number
  tokensCharged: number
  revenueRp: number
  profitRp: number
}
interface FeatureRow {
  featureKey: string
  modelName: string
  provider: string
  calls: number
  apiCostRp: number
  revenueRp: number
  profitRp: number
}
interface TimelineRow {
  day: string
  provider: string
  apiCostRp: number
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

    const [totals, byProvider, byFeature, timeline] = await Promise.all([
      prisma.aiGenerationLog.aggregate({
        where: { createdAt: { gte: from, lt: to } },
        _count: { _all: true },
        _sum: {
          apiCostUsd: true,
          apiCostRp: true,
          tokensCharged: true,
          revenueRp: true,
          profitRp: true,
        },
      }),
      prisma.$queryRaw<ProviderRow[]>`
        SELECT COALESCE(NULLIF("provider", ''), 'OTHER') AS provider,
               COUNT(*)::int AS calls,
               COALESCE(SUM("apiCostUsd"), 0)::float8 AS "apiCostUsd",
               COALESCE(SUM("apiCostRp"), 0)::float8 AS "apiCostRp",
               COALESCE(SUM("tokensCharged"), 0)::int AS "tokensCharged",
               COALESCE(SUM("revenueRp"), 0)::float8 AS "revenueRp",
               COALESCE(SUM("profitRp"), 0)::float8 AS "profitRp"
        FROM "AiGenerationLog"
        WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
        GROUP BY 1
        ORDER BY "apiCostRp" DESC`,
      prisma.$queryRaw<FeatureRow[]>`
        SELECT "featureKey",
               "modelName",
               COALESCE(NULLIF("provider", ''), 'OTHER') AS provider,
               COUNT(*)::int AS calls,
               COALESCE(SUM("apiCostRp"), 0)::float8 AS "apiCostRp",
               COALESCE(SUM("revenueRp"), 0)::float8 AS "revenueRp",
               COALESCE(SUM("profitRp"), 0)::float8 AS "profitRp"
        FROM "AiGenerationLog"
        WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
        GROUP BY 1, 2, 3
        ORDER BY "apiCostRp" DESC
        LIMIT 50`,
      prisma.$queryRaw<TimelineRow[]>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
               COALESCE(NULLIF("provider", ''), 'OTHER') AS provider,
               COALESCE(SUM("apiCostRp"), 0)::float8 AS "apiCostRp"
        FROM "AiGenerationLog"
        WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
        GROUP BY 1, 2
        ORDER BY 1 ASC`,
    ])

    return jsonOk({
      from: from.toISOString(),
      to: to.toISOString(),
      totals: {
        calls: totals._count._all,
        apiCostUsd: totals._sum.apiCostUsd ?? 0,
        apiCostRp: totals._sum.apiCostRp ?? 0,
        tokensCharged: totals._sum.tokensCharged ?? 0,
        revenueRp: totals._sum.revenueRp ?? 0,
        profitRp: totals._sum.profitRp ?? 0,
      },
      byProvider,
      byFeature,
      timeline,
    })
  } catch (err) {
    console.error('[GET /api/admin/token-cost/summary] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
