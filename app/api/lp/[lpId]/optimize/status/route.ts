// GET /api/lp/[lpId]/optimize/status?id=<optimizationId>
// Polling status job optimasi AI (lihat POST /optimize).
//
// - Dengan `id`  → status baris itu.
// - Tanpa `id`   → job RUNNING terbaru milik LP (dipakai client saat mount
//                  untuk melanjutkan polling setelah reload) atau {status:'NONE'}.
//
// Payload:
//   RUNNING → { optimizationId, status, elapsedSec }
//   FAILED  → { optimizationId, status, error }
//   DONE    → { optimizationId, status, suggestions, focusAreas, scoreBefore,
//               scoreAfter, rewrittenHtml, cost{…} } — sama dgn respons
//               sinkron lama supaya dialog hasil tidak berubah.
import type { Prisma } from '@prisma/client'
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { sweepStaleLpOptimizations } from '@/lib/services/lp-optimize-job'
import { deriveOptimizationView } from '@/lib/services/lp-optimize-job-rules'

interface Params {
  params: Promise<{ lpId: string }>
}

export const dynamic = 'force-dynamic'

const ID_MAX_LEN = 64

const STATUS_SELECT = {
  id: true,
  status: true,
  applied: true,
  errorMessage: true,
  createdAt: true,
  suggestionsJson: true,
  focusAreasJson: true,
  scoreBefore: true,
  scoreAfter: true,
  afterHtml: true,
  inputTokens: true,
  outputTokens: true,
  providerCostUsd: true,
  providerCostRp: true,
  platformTokensCharged: true,
} satisfies Prisma.LpOptimizationSelect

type StatusRow = Prisma.LpOptimizationGetPayload<{
  select: typeof STATUS_SELECT
}>

function toStatusPayload(row: StatusRow, now: number) {
  const view = deriveOptimizationView(
    {
      status: row.status,
      hasAfterHtml: row.afterHtml !== null,
      applied: row.applied,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt,
    },
    now,
  )
  if (view.status === 'RUNNING') {
    return {
      optimizationId: row.id,
      status: view.status,
      elapsedSec: Math.max(
        0,
        Math.floor((now - row.createdAt.getTime()) / 1000),
      ),
    }
  }
  if (view.status === 'FAILED') {
    return { optimizationId: row.id, status: view.status, error: view.error }
  }
  return {
    optimizationId: row.id,
    status: view.status,
    applied: row.applied,
    suggestions: Array.isArray(row.suggestionsJson)
      ? (row.suggestionsJson as Array<{
          title: string
          rationale: string
          impact: string
        }>)
      : [],
    focusAreas: Array.isArray(row.focusAreasJson)
      ? (row.focusAreasJson as string[])
      : [],
    scoreBefore: row.scoreBefore,
    scoreAfter: row.scoreAfter,
    rewrittenHtml: row.afterHtml ?? '',
    cost: {
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      providerCostUsd: row.providerCostUsd,
      providerCostRp: row.providerCostRp,
      platformTokensCharged: row.platformTokensCharged,
    },
  }
}

export async function GET(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { lpId } = await params

  try {
    const id = new URL(req.url).searchParams.get('id')?.trim() || null
    if (id && id.length > ID_MAX_LEN) return jsonError('id tidak valid', 400)

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
      return jsonError('AI optimization eksklusif POWER plan', 403)
    }

    // Lazy sweep — baris RUNNING yatim (server restart) jadi FAILED.
    await sweepStaleLpOptimizations(lpId)

    const row = id
      ? await prisma.lpOptimization.findFirst({
          where: { id, lpId, userId: session.user.id },
          select: STATUS_SELECT,
        })
      : await prisma.lpOptimization.findFirst({
          where: { lpId, status: 'RUNNING' },
          orderBy: { createdAt: 'desc' },
          select: STATUS_SELECT,
        })

    if (!row) {
      return id
        ? jsonError('Optimasi tidak ditemukan', 404)
        : jsonOk({ status: 'NONE' as const })
    }
    return jsonOk(toStatusPayload(row, Date.now()))
  } catch (err) {
    console.error('[GET /api/lp/:id/optimize/status] gagal:', err)
    return jsonError('Gagal memuat status optimasi', 500)
  }
}
