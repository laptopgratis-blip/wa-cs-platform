// GET  /api/lp/[lpId]/score  — return latest cached score + breakdown.
//                              Auto-recompute kalau stale (>24 jam).
// POST /api/lp/[lpId]/score  — force recompute on-demand (user manual refresh).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import {
  computeLpScore,
  persistScore,
  SCORE_LABELS,
  SCORE_WEIGHTS,
} from '@/lib/services/lp-score'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ lpId: string }>
}

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000

async function authCheck(lpId: string, userId: string) {
  const lp = await prisma.landingPage.findUnique({
    where: { id: lpId },
    select: {
      userId: true,
      user: { select: { lpQuota: { select: { tier: true } } } },
    },
  })
  if (!lp) return { ok: false as const, error: 'LP tidak ditemukan', status: 404 }
  if (lp.userId !== userId)
    return { ok: false as const, error: 'Forbidden', status: 403 }
  if ((lp.user.lpQuota?.tier ?? 'FREE') !== 'POWER')
    return { ok: false as const, error: 'Score eksklusif POWER plan', status: 403 }
  return { ok: true as const }
}

export async function GET(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { lpId } = await params
  const auth = await authCheck(lpId, session.user.id)
  if (!auth.ok) return jsonError(auth.error, auth.status)

  try {
    let latest = await prisma.lpScore.findFirst({
      where: { landingPageId: lpId },
      orderBy: { computedAt: 'desc' },
    })

    // Auto-recompute kalau belum pernah ATAU stale.
    if (!latest || Date.now() - latest.computedAt.getTime() > STALE_THRESHOLD_MS) {
      const result = await computeLpScore(lpId)
      const id = await persistScore(lpId, result, 'cron')
      latest = await prisma.lpScore.findUnique({ where: { id } })
    }

    if (!latest) return jsonError('Compute score gagal', 500)

    return jsonOk({
      total: latest.total,
      breakdown: latest.breakdownJson,
      periodDays: latest.periodDays,
      sampleVisits: latest.sampleVisits,
      trigger: latest.trigger,
      computedAt: latest.computedAt.toISOString(),
      meta: {
        weights: SCORE_WEIGHTS,
        labels: SCORE_LABELS,
        confidenceThresholdVisits: 30,
      },
    })
  } catch (err) {
    console.error('[GET /api/lp/:id/score] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function POST(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { lpId } = await params
  const auth = await authCheck(lpId, session.user.id)
  if (!auth.ok) return jsonError(auth.error, auth.status)

  try {
    const result = await computeLpScore(lpId)
    await persistScore(lpId, result, 'manual')
    return jsonOk({
      total: result.total,
      breakdown: result.breakdown,
      sampleVisits: result.sampleVisits,
      confidence: result.confidence,
      periodDays: result.periodDays,
    })
  } catch (err) {
    console.error('[POST /api/lp/:id/score] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
