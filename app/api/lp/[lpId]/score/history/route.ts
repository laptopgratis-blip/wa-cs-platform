// GET /api/lp/[lpId]/score/history?days=90
// Return semua snapshot score di window terakhir untuk render trend chart.
// Annotated dengan optimization apply markers (kalau ada di range).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ lpId: string }>
}

export async function GET(req: Request, { params }: Params) {
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
      user: { select: { lpQuota: { select: { tier: true } } } },
    },
  })
  if (!lp) return jsonError('LP tidak ditemukan', 404)
  if (lp.userId !== session.user.id) return jsonError('Forbidden', 403)
  if ((lp.user.lpQuota?.tier ?? 'FREE') !== 'POWER') {
    return jsonError('Score eksklusif POWER plan', 403)
  }

  const url = new URL(req.url)
  const days = Math.max(7, Math.min(365, Number(url.searchParams.get('days') ?? '90') || 90))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const [scores, optimizationsApplied] = await Promise.all([
    prisma.lpScore.findMany({
      where: { landingPageId: lpId, computedAt: { gte: since } },
      orderBy: { computedAt: 'asc' },
      select: { total: true, computedAt: true, trigger: true, sampleVisits: true },
    }),
    // Marker — tiap apply optimization jadi anchor di chart.
    prisma.lpOptimization.findMany({
      where: {
        lpId,
        applied: true,
        appliedAt: { gte: since, not: null },
      },
      orderBy: { appliedAt: 'asc' },
      select: {
        id: true,
        appliedAt: true,
        scoreBefore: true,
        scoreAfter: true,
      },
    }),
  ])

  return jsonOk({
    days,
    points: scores.map((s) => ({
      total: s.total,
      computedAt: s.computedAt.toISOString(),
      trigger: s.trigger,
      sampleVisits: s.sampleVisits,
    })),
    applyMarkers: optimizationsApplied.map((o) => ({
      id: o.id,
      appliedAt: o.appliedAt!.toISOString(),
      scoreBefore: o.scoreBefore,
      scoreAfter: o.scoreAfter,
    })),
  })
}
