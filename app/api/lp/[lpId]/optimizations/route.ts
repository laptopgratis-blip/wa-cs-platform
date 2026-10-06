// GET /api/lp/[lpId]/optimizations
// List semua AI optimization records milik LP (sorted desc). Dipakai
// "Riwayat Saran AI" dialog supaya user bisa lihat suggestions historis +
// apply ulang yang belum di-apply.
//
// Field afterHtml TIDAK dikembalikan di list (besar). Untuk preview/apply,
// pakai existing endpoint POST /optimize/apply dengan optimizationId.
//
// Sejak optimasi jadi background job (2026-10-06): tiap baris membawa
// `status` (RUNNING|DONE|FAILED), `canApply` hanya untuk DONE, dan `isStale`
// = LP sudah diedit sejak saran dibuat (apply akan menimpa editan itu).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { sweepStaleLpOptimizations } from '@/lib/services/lp-optimize-job'
import {
  deriveOptimizationView,
  isApplyStale,
} from '@/lib/services/lp-optimize-job-rules'

interface Params {
  params: Promise<{ lpId: string }>
}

const LIST_LIMIT = 100

export async function GET(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { lpId } = await params

  try {
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
      return jsonError('Eksklusif POWER plan', 403)
    }

    // Lazy sweep — RUNNING yatim (server restart) tampil sebagai gagal.
    await sweepStaleLpOptimizations(lpId)

    const optimizations = await prisma.lpOptimization.findMany({
      where: { lpId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        model: true,
        status: true,
        suggestionsJson: true,
        focusAreasJson: true,
        scoreBefore: true,
        scoreAfter: true,
        providerCostRp: true,
        platformTokensCharged: true,
        applied: true,
        appliedAt: true,
        appliedVersionId: true,
        errorMessage: true,
        createdAt: true,
        finishedAt: true,
      },
      take: LIST_LIMIT,
    })

    // afterHtml besar — tidak ikut di list. Query terpisah hanya untuk baris
    // yang punya hasil & belum di-apply, sekalian beforeHtml untuk cek basi.
    const withResult = await prisma.lpOptimization.findMany({
      where: { lpId, afterHtml: { not: null }, applied: false, status: 'DONE' },
      select: { id: true, beforeHtml: true },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    })
    const beforeById = new Map(withResult.map((o) => [o.id, o.beforeHtml]))
    const now = Date.now()

    return jsonOk({
      optimizations: optimizations.map((o) => {
        const view = deriveOptimizationView(
          {
            status: o.status,
            hasAfterHtml: beforeById.has(o.id) || o.applied,
            applied: o.applied,
            errorMessage: o.errorMessage,
            createdAt: o.createdAt,
          },
          now,
        )
        const canApply = view.canApply && beforeById.has(o.id)
        return {
          id: o.id,
          model: o.model,
          status: view.status,
          suggestions: Array.isArray(o.suggestionsJson)
            ? (o.suggestionsJson as Array<{
                title: string
                rationale: string
                impact: string
              }>)
            : [],
          focusAreas: Array.isArray(o.focusAreasJson)
            ? (o.focusAreasJson as string[])
            : [],
          scoreBefore: o.scoreBefore,
          scoreAfter: o.scoreAfter,
          providerCostRp: o.providerCostRp,
          platformTokensCharged: o.platformTokensCharged,
          applied: o.applied,
          appliedAt: o.appliedAt?.toISOString() ?? null,
          appliedVersionId: o.appliedVersionId,
          canApply,
          isStale: canApply
            ? isApplyStale(beforeById.get(o.id) ?? null, lp.htmlContent)
            : false,
          errorMessage: view.error ?? o.errorMessage,
          createdAt: o.createdAt.toISOString(),
          finishedAt: o.finishedAt?.toISOString() ?? null,
        }
      }),
    })
  } catch (err) {
    console.error('[GET /api/lp/:id/optimizations] gagal:', err)
    return jsonError('Gagal memuat riwayat optimasi', 500)
  }
}
