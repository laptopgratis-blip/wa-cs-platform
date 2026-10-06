// POST /api/lp/[lpId]/optimize
// Mulai optimasi AI sebagai BACKGROUND JOB (2026-10-06).
//
// Dulu route ini menunggu AI selesai (144–212 dtk) — Cloudflare memutus
// request di 100 dtk (524), jadi user melihat "Network error" padahal token
// sudah terpotong & hasil tersimpan. Sekarang:
// 1. Precheck: LP milik user, plan POWER, ukuran LP, saldo cukup (estimasi).
// 2. Transaksi + advisory lock per LP: sapu RUNNING basi → kalau masih ada
//    RUNNING, kembalikan id itu (alreadyRunning) → else buat baris RUNNING.
// 3. `after()` menjalankan runLpOptimizeJob (AI + potong token + simpan hasil).
// 4. Balas 202 { optimizationId, status:'RUNNING', estimate } — client polling
//    GET /optimize/status?id=…
import { after, type NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import {
  estimateOptimizationCost,
  getOptimizeModel,
} from '@/lib/services/lp-optimize'
import { loadOptimizeEstimateInputs } from '@/lib/services/lp-optimize-context'
import {
  runLpOptimizeJob,
  sweepStaleLpOptimizations,
} from '@/lib/services/lp-optimize-job'
import { estimateOptimizeDuration } from '@/lib/services/lp-optimize-job-rules'

interface Params {
  params: Promise<{ lpId: string }>
}

// Route sendiri kini selesai < 2 dtk. Nilai ini tetap 300 karena di platform
// yang menegakkan maxDuration, callback `after()` ikut dibatasi olehnya; di
// server Node self-hosted (hulao) tidak ditegakkan — job dibatasi timeout AI
// internal (LP_OPTIMIZE_AI_TIMEOUT_MS) dan sapuan baris basi.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { lpId } = await params
  const userId = session.user.id

  try {
    const lp = await prisma.landingPage.findUnique({
      where: { id: lpId },
      select: {
        id: true,
        userId: true,
        htmlContent: true,
        user: { select: { lpQuota: { select: { tier: true } } } },
      },
    })
    if (!lp) return jsonError('LP tidak ditemukan', 404)
    if (lp.userId !== userId) return jsonError('Forbidden', 403)
    if ((lp.user.lpQuota?.tier ?? 'FREE') !== 'POWER') {
      return jsonError('AI optimization eksklusif POWER plan', 403)
    }

    const inputs = await loadOptimizeEstimateInputs(lpId)
    const estimate = await estimateOptimizationCost({
      htmlContent: lp.htmlContent,
      signalsCount: inputs.signalsCount,
      hasAnalytics: inputs.hasAnalytics,
    })

    // Tolak DI MUKA kalau LP melebihi context window AI — pesan jelas, bukan
    // generic "AI service error 400" dari Anthropic.
    if (estimate.exceedsContextLimit) {
      return jsonError(
        estimate.contextLimitMessage ??
          'LP terlalu besar untuk AI optimization.',
        413,
      )
    }

    const balance = await prisma.tokenBalance
      .findUnique({ where: { userId }, select: { balance: true } })
      .then((b) => b?.balance ?? 0)
    if (balance < estimate.platformTokensCharge) {
      // `error` = pesan siap tampil (fetchJson client hanya membaca field ini).
      return Response.json(
        {
          success: false,
          error: `Saldo token tidak cukup. Butuh ±${estimate.platformTokensCharge.toLocaleString('id-ID')} token, saldo kamu ${balance.toLocaleString('id-ID')} token. Top-up dulu lalu coba lagi.`,
          code: 'INSUFFICIENT_TOKEN',
          required: estimate.platformTokensCharge,
          currentBalance: balance,
        },
        { status: 402 },
      )
    }

    const model = await getOptimizeModel()
    const job = await prisma.$transaction(async (tx) => {
      // Satu job per LP. findFirst lalu create adalah check-then-act — dua
      // klik/tab paralel bisa sama-sama lolos & bayar dua kali. Advisory lock
      // per LP membuatnya berurutan; lepas otomatis saat commit.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('lp_optimize'), hashtext(${lpId}))`
      await sweepStaleLpOptimizations(lpId, tx)
      const running = await tx.lpOptimization.findFirst({
        where: { lpId, status: 'RUNNING' },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
      if (running) return { id: running.id, alreadyRunning: true }

      const created = await tx.lpOptimization.create({
        data: {
          lpId,
          userId,
          model,
          status: 'RUNNING',
          inputTokens: 0,
          outputTokens: 0,
          beforeHtml: lp.htmlContent,
          contextSummary: `signals=${inputs.signalsCount}, visits=${inputs.recentVisits}`,
          applied: false,
        },
        select: { id: true },
      })
      return { id: created.id, alreadyRunning: false }
    })

    if (!job.alreadyRunning) {
      after(() => runLpOptimizeJob(job.id))
    }

    return jsonOk(
      {
        optimizationId: job.id,
        status: 'RUNNING' as const,
        alreadyRunning: job.alreadyRunning,
        estimate: {
          ...estimate,
          duration: estimateOptimizeDuration(estimate.estimatedOutputTokens),
        },
      },
      202,
    )
  } catch (err) {
    console.error('[POST /api/lp/:id/optimize] gagal memulai:', err)
    return jsonError('Gagal memulai optimasi AI. Coba lagi sebentar lagi.', 500)
  }
}
