// POST /api/lp/[lpId]/optimize/apply
// Body: { optimizationId, force? }
// Apply rewritten HTML dari optimization record ke LandingPage.htmlContent.
// Snapshot HTML sebelumnya ke LpVersion (source=ai). Update LpOptimization.applied=true.
//
// Anti-stale (2026-10-06): saran dibuat dari snapshot `beforeHtml`. Kalau LP
// sudah diedit sejak itu, apply tanpa `force` ditolak 409 supaya editan user
// tidak tertimpa diam-diam; client menampilkan konfirmasi lalu kirim ulang
// dengan force:true.
//
// Atomik: lock baris LP + klaim `applied` + snapshot + replace HTML dalam satu
// transaksi. Idempotent — kalau sudah apply, return success tanpa side effect.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { snapshotVersion } from '@/lib/services/lp-optimize'
import {
  type ApplyDecision,
  decideApplyOptimization,
} from '@/lib/services/lp-optimize-job-rules'
import { computeLpScore, persistScore } from '@/lib/services/lp-score'

interface Params {
  params: Promise<{ lpId: string }>
}

const applySchema = z.object({
  optimizationId: z.string().trim().min(1).max(64),
  force: z.boolean().optional().default(false),
})

const ALREADY_MESSAGE = 'Sudah di-apply sebelumnya.'

type ApplyOutcome =
  | { kind: 'applied'; versionId: string }
  | Exclude<ApplyDecision, { kind: 'apply' }>

async function applyInTransaction(input: {
  lpId: string
  optimizationId: string
  force: boolean
}): Promise<ApplyOutcome> {
  const { lpId, optimizationId, force } = input
  return prisma.$transaction(async (tx) => {
    // Kunci baris LP: save editor (UPDATE biasa) menunggu sampai transaksi
    // ini selesai, jadi cek basi di bawah tidak bisa disalip editan baru.
    await tx.$queryRaw`SELECT id FROM "LandingPage" WHERE id = ${lpId} FOR UPDATE`
    const [lp, opt] = await Promise.all([
      tx.landingPage.findUnique({
        where: { id: lpId },
        select: { htmlContent: true },
      }),
      tx.lpOptimization.findUnique({
        where: { id: optimizationId },
        select: {
          status: true,
          applied: true,
          errorMessage: true,
          createdAt: true,
          beforeHtml: true,
          afterHtml: true,
          scoreAfter: true,
        },
      }),
    ])
    if (!lp || !opt) {
      return {
        kind: 'reject',
        httpStatus: 400,
        message: 'Data optimasi tidak ditemukan.',
      }
    }

    const decision = decideApplyOptimization({
      status: opt.status,
      hasAfterHtml: opt.afterHtml !== null,
      applied: opt.applied,
      errorMessage: opt.errorMessage,
      createdAt: opt.createdAt,
      beforeHtml: opt.beforeHtml,
      currentHtml: lp.htmlContent,
      force,
    })
    if (decision.kind !== 'apply') return decision
    // decideApplyOptimization sudah menjamin afterHtml ada; cek ulang untuk TS.
    const afterHtml = opt.afterHtml
    if (afterHtml === null) {
      return {
        kind: 'reject',
        httpStatus: 400,
        message: 'Optimasi ini tidak punya hasil HTML untuk di-apply.',
      }
    }

    // Klaim eksklusif — dua klik/tab paralel tidak bisa apply dobel.
    const claim = await tx.lpOptimization.updateMany({
      where: { id: optimizationId, applied: false, status: 'DONE' },
      data: { applied: true, appliedAt: new Date() },
    })
    if (claim.count === 0) return { kind: 'already' }

    // Snapshot versi current SEBELUM replace (rollback safety).
    const versionId = await snapshotVersion(
      {
        lpId,
        htmlContent: lp.htmlContent,
        source: 'ai',
        optimizationId,
        scoreSnapshot: opt.scoreAfter ?? null,
        note: `Pre-apply snapshot — optimasi #${optimizationId.slice(0, 8)}`,
      },
      tx,
    )
    await tx.landingPage.update({
      where: { id: lpId },
      data: { htmlContent: afterHtml },
    })
    await tx.lpOptimization.update({
      where: { id: optimizationId },
      data: { appliedVersionId: versionId },
    })
    return { kind: 'applied', versionId }
  })
}

export async function POST(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { lpId } = await params

  try {
    const parsed = applySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return jsonError('optimizationId wajib', 400)
    const { optimizationId, force } = parsed.data

    // Validasi kepemilikan di luar transaksi (murah, tanpa lock).
    const [opt, lp] = await Promise.all([
      prisma.lpOptimization.findUnique({
        where: { id: optimizationId },
        select: { lpId: true, userId: true },
      }),
      prisma.landingPage.findUnique({
        where: { id: lpId },
        select: { userId: true },
      }),
    ])
    if (!opt) return jsonError('Optimization tidak ditemukan', 404)
    if (opt.userId !== session.user.id) return jsonError('Forbidden', 403)
    if (opt.lpId !== lpId) return jsonError('LP mismatch', 400)
    if (!lp) return jsonError('LP tidak ditemukan', 404)
    if (lp.userId !== session.user.id) return jsonError('Forbidden', 403)

    const outcome = await applyInTransaction({ lpId, optimizationId, force })

    if (outcome.kind === 'already') {
      return jsonOk({ already: true, optimizationId, message: ALREADY_MESSAGE })
    }
    if (outcome.kind === 'reject') {
      return Response.json(
        {
          success: false,
          error: outcome.message,
          ...(outcome.code ? { code: outcome.code } : {}),
        },
        { status: outcome.httpStatus },
      )
    }

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
      versionId: outcome.versionId,
      message:
        'HTML LP sudah di-update. Versi sebelumnya tersimpan di Riwayat — bisa restore kapan saja.',
    })
  } catch (err) {
    console.error('[POST /api/lp/:id/optimize/apply] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
