// GET /api/admin/profitability/by-model?from=&to=
// Aggregate per AiModel via JOIN Message → WhatsappSession → AiModel.
import { Prisma } from '@prisma/client'
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { getPricingSettings } from '@/lib/pricing-settings'
import { prisma } from '@/lib/prisma'
import { parseRange, statusOf } from '@/lib/profitability'

interface RawRow {
  modelId: string
  name: string
  provider: string
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
        m."id" AS "modelId",
        m."name" AS "name",
        m."provider"::text AS "provider",
        COUNT(*)::bigint AS "count",
        SUM(msg."apiCostRp") AS "apiCostRp",
        SUM(msg."revenueRp") AS "revenueRp",
        SUM(msg."profitRp") AS "profitRp"
      FROM "Message" msg
      JOIN "WhatsappSession" ws ON msg."waSessionId" = ws."id"
      JOIN "AiModel" m ON ws."modelId" = m."id"
      WHERE msg."role" = 'AI' AND msg."createdAt" >= ${from} AND msg."createdAt" < ${to}
      GROUP BY m."id", m."name", m."provider"
      ORDER BY SUM(msg."profitRp") DESC NULLS LAST
    `)

    const data = rows.map((r) => {
      const apiCostRp = r.apiCostRp ?? 0
      const revenueRp = r.revenueRp ?? 0
      const profitRp = r.profitRp ?? 0
      const marginPct = revenueRp > 0 ? (profitRp / revenueRp) * 100 : 0
      return {
        modelId: r.modelId,
        name: r.name,
        provider: r.provider,
        messages: Number(r.count),
        apiCostRp,
        revenueRp,
        profitRp,
        marginPct,
        status: statusOf(marginPct, settings.marginTarget),
      }
    })

    return jsonOk(data)
  } catch (err) {
    console.error('[GET /api/admin/profitability/by-model] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
