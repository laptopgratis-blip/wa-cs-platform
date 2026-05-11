// GET /api/admin/profitability/summary?from=&to=
// Aggregate profit/cost/revenue + delta vs periode sebelumnya.
// Sumber data: Message (AI CS WA) + AiGenerationLog (Content Studio/Ads) +
// LpGeneration + LpOptimization + SoulSimulation (admin tool, no revenue).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { getPricingSettings, type PricingValues } from '@/lib/pricing-settings'
import { prisma } from '@/lib/prisma'
import { parseRange, previousRange, statusOf } from '@/lib/profitability'

interface AggResult {
  count: number
  apiCostRp: number
  revenueRp: number
  profitRp: number
  bySource: {
    messageAi: { calls: number; cost: number; revenue: number }
    aiGenerationLog: { calls: number; cost: number; revenue: number }
    lpGeneration: { calls: number; cost: number; revenue: number }
    lpOptimization: { calls: number; cost: number; revenue: number }
    soulSimulation: { calls: number; cost: number; revenue: number }
  }
}

async function aggregate(
  from: Date,
  to: Date,
  pricing: PricingValues,
): Promise<AggResult> {
  // Range filter sama untuk semua source: createdAt >= from AND < to.
  const range = { gte: from, lt: to }
  const [msg, gen, lpGen, lpOpt, sim] = await Promise.all([
    prisma.message.aggregate({
      where: { role: 'AI', createdAt: range },
      _count: { _all: true },
      _sum: { apiCostRp: true, revenueRp: true, profitRp: true },
    }),
    prisma.aiGenerationLog.aggregate({
      where: { status: 'OK', createdAt: range },
      _count: { _all: true },
      _sum: { apiCostRp: true, revenueRp: true, profitRp: true },
    }),
    prisma.lpGeneration.aggregate({
      where: { createdAt: range },
      _count: { _all: true },
      _sum: { providerCostRp: true, platformTokensCharged: true },
    }),
    prisma.lpOptimization.aggregate({
      where: { createdAt: range },
      _count: { _all: true },
      _sum: { providerCostRp: true, platformTokensCharged: true },
    }),
    prisma.soulSimulation.aggregate({
      where: { createdAt: range },
      _count: { _all: true },
      _sum: { totalCostRp: true },
    }),
  ])

  const lpGenRevenue =
    (lpGen._sum.platformTokensCharged ?? 0) * pricing.pricePerToken
  const lpOptRevenue =
    (lpOpt._sum.platformTokensCharged ?? 0) * pricing.pricePerToken
  // SoulSimulation = admin tool (tidak charge user). Cost masuk, revenue 0.

  const bySource = {
    messageAi: {
      calls: msg._count._all,
      cost: msg._sum.apiCostRp ?? 0,
      revenue: msg._sum.revenueRp ?? 0,
    },
    aiGenerationLog: {
      calls: gen._count._all,
      cost: gen._sum.apiCostRp ?? 0,
      revenue: gen._sum.revenueRp ?? 0,
    },
    lpGeneration: {
      calls: lpGen._count._all,
      cost: lpGen._sum.providerCostRp ?? 0,
      revenue: lpGenRevenue,
    },
    lpOptimization: {
      calls: lpOpt._count._all,
      cost: lpOpt._sum.providerCostRp ?? 0,
      revenue: lpOptRevenue,
    },
    soulSimulation: {
      calls: sim._count._all,
      cost: sim._sum.totalCostRp ?? 0,
      revenue: 0,
    },
  }

  const apiCostRp = Object.values(bySource).reduce((s, x) => s + x.cost, 0)
  const revenueRp = Object.values(bySource).reduce((s, x) => s + x.revenue, 0)
  const count = Object.values(bySource).reduce((s, x) => s + x.calls, 0)

  return { count, apiCostRp, revenueRp, profitRp: revenueRp - apiCostRp, bySource }
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
    const settings = await getPricingSettings()
    const [curr, prior] = await Promise.all([
      aggregate(range.from, range.to, settings),
      aggregate(prev.from, prev.to, settings),
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
      bySource: curr.bySource,
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
