// GET /api/lp/[lpId]/optimize/estimate
// Return cost estimate untuk confirm dialog SEBELUM user trigger AI optimization.
// Output: htmlChars, estimatedTokens, providerCost, platformCharge, currentBalance.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { estimateOptimizationCost } from '@/lib/services/lp-optimize'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ lpId: string }>
}

export async function GET(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { lpId } = await params

  const lp = await prisma.landingPage.findUnique({
    where: { id: lpId },
    select: {
      userId: true,
      htmlContent: true,
      user: { select: { lpQuota: { select: { tier: true } } } },
    },
  })
  if (!lp) return jsonError('LP tidak ditemukan', 404)
  if (lp.userId !== session.user.id) return jsonError('Forbidden', 403)
  if ((lp.user.lpQuota?.tier ?? 'FREE') !== 'POWER') {
    return jsonError('AI optimization eksklusif POWER plan', 403)
  }

  // Count signals (30d) untuk estimate context size.
  const signalsCount = await prisma.lpChatSignal
    .aggregate({
      where: { landingPageId: lpId, periodDays: 30 },
      _sum: { count: true },
    })
    .then((r) => r._sum.count ?? 0)
    .catch(() => 0)

  // Recent visit count untuk decide hasAnalytics flag.
  const recentVisits = await prisma.lpVisit.count({
    where: {
      landingPageId: lpId,
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
  })

  const estimate = await estimateOptimizationCost({
    htmlContent: lp.htmlContent,
    signalsCount: Math.min(signalsCount, 30), // cap supaya estimasi realistis
    hasAnalytics: recentVisits > 0,
  })

  // Saldo user untuk display "kamu punya X token, akan jadi Y setelah optimasi".
  const balance = await prisma.tokenBalance
    .findUnique({
      where: { userId: session.user.id },
      select: { balance: true },
    })
    .then((b) => b?.balance ?? 0)

  return jsonOk({
    estimate,
    currentBalance: balance,
    sufficientBalance: balance >= estimate.platformTokensCharge,
    hasAnalytics: recentVisits > 0,
    signalsCount,
  })
}
