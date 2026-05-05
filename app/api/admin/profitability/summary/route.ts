// GET /api/admin/profitability/summary?from=&to=
// Aggregate profit/cost/revenue + delta vs periode sebelumnya.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { getPricingSettings } from '@/lib/pricing-settings'
import { prisma } from '@/lib/prisma'
import { parseRange, previousRange, statusOf } from '@/lib/profitability'

interface AggResult {
  count: number
  apiCostRp: number
  revenueRp: number
  profitRp: number
}

async function aggregate(from: Date, to: Date): Promise<AggResult> {
  // Hanya pesan AI yang punya field cost. Pesan customer/HUMAN di-skip.
  const r = await prisma.message.aggregate({
    where: {
      role: 'AI',
      createdAt: { gte: from, lt: to },
    },
    _count: { _all: true },
    _sum: {
      apiCostRp: true,
      revenueRp: true,
      profitRp: true,
    },
  })
  return {
    count: r._count._all,
    apiCostRp: r._sum.apiCostRp ?? 0,
    revenueRp: r._sum.revenueRp ?? 0,
    profitRp: r._sum.profitRp ?? 0,
  }
}

export async function GET(req: Request) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const { searchParams } = new URL(req.url)
    const range = parseRange(searchParams)
    const prev = previousRange(range)
    const [curr, prior, settings] = await Promise.all([
      aggregate(range.from, range.to),
      aggregate(prev.from, prev.to),
      getPricingSettings(),
    ])
    const marginPct =
      curr.revenueRp > 0 ? (curr.profitRp / curr.revenueRp) * 100 : 0
    const profitDeltaPct =
      prior.profitRp !== 0
        ? ((curr.profitRp - prior.profitRp) / Math.abs(prior.profitRp)) * 100
        : null
    return jsonOk({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      messages: curr.count,
      apiCostRp: curr.apiCostRp,
      revenueRp: curr.revenueRp,
      profitRp: curr.profitRp,
      marginPct,
      status: statusOf(marginPct, settings.marginTarget),
      previous: {
        profitRp: prior.profitRp,
        deltaPct: profitDeltaPct,
      },
    })
  } catch (err) {
    console.error('[GET /api/admin/profitability/summary] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
