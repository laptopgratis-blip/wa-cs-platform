// POST /api/lp/[lpId]/optimize/apply
// Body: { optimizationId }
// Apply rewritten HTML dari optimization record ke LandingPage.htmlContent.
// Snapshot HTML sebelumnya ke LpVersion (source=ai). Update LpOptimization.applied=true.
//
// User flow: setelah lihat preview & suggestions, klik "Apply" → endpoint ini
// commit. Idempotent — kalau sudah apply, return success tanpa side effect.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { snapshotVersion } from '@/lib/services/lp-optimize'
import { computeLpScore, persistScore } from '@/lib/services/lp-score'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ lpId: string }>
}

export async function POST(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { lpId } = await params

  const body = (await req.json().catch(() => null)) as { optimizationId?: string } | null
  const optimizationId = body?.optimizationId
  if (!optimizationId) return jsonError('optimizationId wajib', 400)

  // Validate ownership.
  const opt = await prisma.lpOptimization.findUnique({
    where: { id: optimizationId },
    select: {
      id: true,
      lpId: true,
      userId: true,
      afterHtml: true,
      beforeHtml: true,
      applied: true,
      scoreAfter: true,
    },
  })
  if (!opt) return jsonError('Optimization tidak ditemukan', 404)
  if (opt.userId !== session.user.id) return jsonError('Forbidden', 403)
  if (opt.lpId !== lpId) return jsonError('LP mismatch', 400)
  if (!opt.afterHtml) return jsonError('Optimization belum punya hasil HTML', 400)
  if (opt.applied) {
    return jsonOk({ already: true, optimizationId, message: 'Sudah di-apply sebelumnya.' })
  }

  // Cek LP masih ada + grab current HTML untuk snapshot.
  const lp = await prisma.landingPage.findUnique({
    where: { id: lpId },
    select: { id: true, htmlContent: true, userId: true },
  })
  if (!lp) return jsonError('LP tidak ditemukan', 404)
  if (lp.userId !== session.user.id) return jsonError('Forbidden', 403)

  try {
    // Snapshot versi current SEBELUM replace (rollback safety).
    const versionId = await snapshotVersion({
      lpId,
      htmlContent: lp.htmlContent,
      source: 'ai',
      optimizationId: opt.id,
      scoreSnapshot: opt.scoreAfter ?? null,
      note: `Pre-apply snapshot — optimasi #${opt.id.slice(0, 8)}`,
    })

    // Replace HTML.
    await prisma.landingPage.update({
      where: { id: lpId },
      data: { htmlContent: opt.afterHtml },
    })

    // Mark optimization applied.
    await prisma.lpOptimization.update({
      where: { id: opt.id },
      data: {
        applied: true,
        appliedAt: new Date(),
        appliedVersionId: versionId,
      },
    })

    // Snapshot score post-apply — anchor untuk score-over-time chart.
    // Best-effort: gagal score compute jangan gagalkan apply (HTML sudah
    // di-update, user perlu confirmation success).
    void computeLpScore(lpId)
      .then((result) => persistScore(lpId, result, 'apply'))
      .catch((err) =>
        console.error('[apply] post-apply score snapshot gagal:', err),
      )

    return jsonOk({
      optimizationId,
      versionId,
      message: 'HTML LP sudah di-update. Versi sebelumnya tersimpan di Riwayat — bisa restore kapan saja.',
    })
  } catch (err) {
    console.error('[POST /api/lp/:id/optimize/apply] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
