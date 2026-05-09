// GET /api/lp/[lpId]/optimizations
// List semua AI optimization records milik LP (sorted desc). Dipakai
// "Riwayat Saran AI" dialog supaya user bisa lihat suggestions historis +
// apply ulang yang belum di-apply.
//
// Field afterHtml TIDAK dikembalikan di list (besar). Untuk preview/apply,
// pakai existing endpoint POST /optimize/apply dengan optimizationId.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
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
      user: { select: { lpQuota: { select: { tier: true } } } },
    },
  })
  if (!lp) return jsonError('LP tidak ditemukan', 404)
  if (lp.userId !== session.user.id) return jsonError('Forbidden', 403)
  if ((lp.user.lpQuota?.tier ?? 'FREE') !== 'POWER') {
    return jsonError('Eksklusif POWER plan', 403)
  }

  const optimizations = await prisma.lpOptimization.findMany({
    where: { lpId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      model: true,
      suggestionsJson: true,
      focusAreasJson: true,
      scoreBefore: true,
      scoreAfter: true,
      providerCostRp: true,
      platformTokensCharged: true,
      applied: true,
      appliedAt: true,
      appliedVersionId: true,
      // afterHtml NULL → AI fail. afterHtml ada tapi applied=false → user
      // discard, masih bisa di-apply kemudian.
      afterHtml: false, // exclude dari list — query terpisah saat detail
      errorMessage: true,
      createdAt: true,
    },
    take: 100,
  })

  // Tambah flag canApply: ada hasil HTML + belum di-apply.
  // Karena afterHtml di-exclude di select, query terpisah untuk presence check.
  const haveAfter = await prisma.lpOptimization.findMany({
    where: { lpId, afterHtml: { not: null }, applied: false },
    select: { id: true },
  })
  const applicableIds = new Set(haveAfter.map((o) => o.id))

  return jsonOk({
    optimizations: optimizations.map((o) => ({
      id: o.id,
      model: o.model,
      suggestions: Array.isArray(o.suggestionsJson)
        ? (o.suggestionsJson as Array<{ title: string; rationale: string; impact: string }>)
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
      canApply: applicableIds.has(o.id),
      errorMessage: o.errorMessage,
      createdAt: o.createdAt.toISOString(),
    })),
  })
}
