// Job background optimasi LP AI.
//
// Route POST /api/lp/[lpId]/optimize hanya membuat baris LpOptimization
// berstatus RUNNING lalu menjadwalkan `runLpOptimizeJob` lewat `after()`.
// Job ini memanggil AI (bisa 2–4 menit), memotong token, lalu menandai baris
// DONE (+hasil) atau FAILED (+pesan ramah). Client polling
// GET /optimize/status untuk melihat hasilnya.
//
// Kalau proses mati di tengah (deploy/restart), baris tertinggal RUNNING —
// disapu jadi FAILED oleh `sweepStaleLpOptimizations` setelah 15 menit.
import type { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { executeAiWithCharge } from '@/lib/services/ai-generation-log'
import {
  estimateOptimizationCost,
  runOptimization,
} from '@/lib/services/lp-optimize'
import { buildOptimizeContext } from '@/lib/services/lp-optimize-context'
import {
  friendlyOptimizeError,
  LP_OPTIMIZE_AI_TIMEOUT_MS,
  LP_OPTIMIZE_STALE_MESSAGE,
  LP_OPTIMIZE_STALE_MS,
  LpOptimizeUserError,
} from '@/lib/services/lp-optimize-job-rules'

const LOG_TAG = '[lp-optimize-job]'
const ERROR_MESSAGE_MAX = 1000

// Tandai RUNNING basi (> 15 menit) jadi FAILED. Bisa dipanggil di dalam
// transaksi (route start) atau langsung (lazy sweep di endpoint baca).
export async function sweepStaleLpOptimizations(
  lpId: string,
  db: Prisma.TransactionClient = prisma,
): Promise<number> {
  const cutoff = new Date(Date.now() - LP_OPTIMIZE_STALE_MS)
  const res = await db.lpOptimization.updateMany({
    where: { lpId, status: 'RUNNING', createdAt: { lt: cutoff } },
    data: {
      status: 'FAILED',
      errorMessage: LP_OPTIMIZE_STALE_MESSAGE,
      finishedAt: new Date(),
    },
  })
  return res.count
}

// Hanya menimpa baris yang MASIH RUNNING — jangan pernah menurunkan DONE.
async function markFailed(
  optimizationId: string,
  message: string,
): Promise<void> {
  await prisma.lpOptimization.updateMany({
    where: { id: optimizationId, status: 'RUNNING' },
    data: {
      status: 'FAILED',
      errorMessage: message.slice(0, ERROR_MESSAGE_MAX),
      finishedAt: new Date(),
    },
  })
}

async function executeJob(optimizationId: string): Promise<void> {
  const row = await prisma.lpOptimization.findUnique({
    where: { id: optimizationId },
    select: {
      id: true,
      lpId: true,
      userId: true,
      status: true,
      beforeHtml: true,
    },
  })
  // Sudah selesai / disapu / dihapus — tidak ada yang perlu dikerjakan.
  if (!row || row.status !== 'RUNNING') return
  if (!row.beforeHtml) {
    throw new LpOptimizeUserError(
      'HTML LP kosong — tidak ada yang bisa dioptimasi.',
    )
  }
  const htmlContent = row.beforeHtml

  const context = await buildOptimizeContext(row.lpId)
  const estimate = await estimateOptimizationCost({
    htmlContent,
    signalsCount: context.signalsCount,
    hasAnalytics: context.hasAnalytics,
  })

  const { result, charge } = await executeAiWithCharge<
    Awaited<ReturnType<typeof runOptimization>>
  >({
    featureKey: 'LP_OPTIMIZE',
    userId: row.userId,
    ctx: {
      referencePrefix: `lp_optimize:${row.id}`,
      description: 'LP AI Optimization',
      subjectType: 'LP',
      subjectId: row.lpId,
      estimateInputTokens: estimate.estimatedInputTokens,
      estimateOutputTokens: estimate.estimatedOutputTokens,
      aiCall: async () => {
        const r = await runOptimization(
          {
            htmlContent,
            signals: context.signals,
            analytics: context.analytics,
          },
          { timeoutMs: LP_OPTIMIZE_AI_TIMEOUT_MS },
        )
        return {
          result: r,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
        }
      },
    },
  })

  // Token sudah dipotong — hasil WAJIB tersimpan & terlihat walau baris
  // sempat tersapu jadi FAILED (karena itu update by id, bukan by status).
  await prisma.lpOptimization.update({
    where: { id: row.id },
    data: {
      status: 'DONE',
      finishedAt: new Date(),
      errorMessage: null,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      inputPricePer1MUsd: charge.pricingSnapshot.inputPricePer1M,
      outputPricePer1MUsd: charge.pricingSnapshot.outputPricePer1M,
      providerCostUsd: charge.apiCostUsd,
      providerCostRp: charge.apiCostRp,
      platformTokensCharged: charge.tokensCharged,
      suggestionsJson: result.suggestions,
      focusAreasJson: result.focusAreas,
      scoreBefore: result.scoreBefore,
      scoreAfter: result.scoreAfter,
      afterHtml: result.rewrittenHtml,
    },
  })
}

// Never-throw: dipanggil dari `after()` — error yang lolos tak punya penangan.
export async function runLpOptimizeJob(optimizationId: string): Promise<void> {
  try {
    await executeJob(optimizationId)
  } catch (err) {
    console.error(`${LOG_TAG} ${optimizationId} gagal:`, err)
    await markFailed(optimizationId, friendlyOptimizeError(err)).catch((e) =>
      console.error(`${LOG_TAG} ${optimizationId} gagal menandai FAILED:`, e),
    )
  } finally {
    // Jaring pengaman: apa pun yang terjadi, baris tidak boleh tertinggal
    // RUNNING (no-op kalau sudah DONE/FAILED).
    await markFailed(optimizationId, friendlyOptimizeError(undefined)).catch(
      (e) => console.error(`${LOG_TAG} ${optimizationId} finalisasi gagal:`, e),
    )
  }
}
