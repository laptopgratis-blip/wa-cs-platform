// POST /api/lp/[lpId]/optimize
// Trigger AI optimization. Flow:
// 1. Validate LP + plan POWER + saldo cukup (re-check actual)
// 2. Build context: analytics 30d + signals + current HTML
// 3. Call Sonnet → suggestions + rewrittenHtml
// 4. Charge token (atomic transaction) — tidak charge kalau AI fail
// 5. Insert LpOptimization record dengan applied=false (apply via separate endpoint)
// 6. Return suggestions + diff data ke client untuk preview
//
// Kalau user discard, tidak ada cleanup (record sudah ter-charge). User
// bisa apply nanti via /apply endpoint pakai optimizationId.
import Anthropic from '@anthropic-ai/sdk'
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import {
  estimateOptimizationCost,
  OPTIMIZE_MODEL,
  runOptimization,
} from '@/lib/services/lp-optimize'
import { SIGNAL_LABELS, type SignalCategory } from '@/lib/services/lp-chat-signals'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ lpId: string }>
}

// Next.js route config — cap durasi 5 menit (Sonnet output panjang bisa
// 60-180s). Default Vercel/serverless 30-60s — di self-hosted Node tidak
// strict, tapi explicit set supaya predictable + future deploy compat.
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
  if (lp.userId !== session.user.id) return jsonError('Forbidden', 403)
  if ((lp.user.lpQuota?.tier ?? 'FREE') !== 'POWER') {
    return jsonError('AI optimization eksklusif POWER plan', 403)
  }

  // Pre-flight cost estimate — cek saldo cukup sebelum panggil AI.
  const signalsCount = await prisma.lpChatSignal
    .aggregate({
      where: { landingPageId: lpId, periodDays: 30 },
      _sum: { count: true },
    })
    .then((r) => r._sum.count ?? 0)
    .catch(() => 0)
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const recentVisits = await prisma.lpVisit.count({
    where: { landingPageId: lpId, createdAt: { gte: since30d } },
  })
  const estimate = await estimateOptimizationCost({
    htmlContent: lp.htmlContent,
    signalsCount: Math.min(signalsCount, 30),
    hasAnalytics: recentVisits > 0,
  })

  const balance = await prisma.tokenBalance
    .findUnique({
      where: { userId: session.user.id },
      select: { balance: true },
    })
    .then((b) => b?.balance ?? 0)
  if (balance < estimate.platformTokensCharge) {
    return Response.json(
      {
        success: false,
        error: 'INSUFFICIENT_TOKEN',
        message: `Saldo token tidak cukup. Butuh ${estimate.platformTokensCharge.toLocaleString('id-ID')} token, kamu punya ${balance.toLocaleString('id-ID')}.`,
        required: estimate.platformTokensCharge,
        currentBalance: balance,
      },
      { status: 402 },
    )
  }

  // Build context: analytics + signals.
  const [signals, analytics] = await Promise.all([
    prisma.lpChatSignal.findMany({
      where: { landingPageId: lpId, periodDays: 30 },
      orderBy: { count: 'desc' },
      take: 5,
    }),
    buildAnalyticsContext(lpId, since30d),
  ])

  const signalsForPrompt = signals
    .filter((s) => s.count > 0)
    .map((s) => ({
      category: s.category,
      label: SIGNAL_LABELS[s.category as SignalCategory] ?? s.category,
      count: s.count,
      samples: Array.isArray(s.sampleQuotes) ? (s.sampleQuotes as string[]) : [],
    }))

  // Insert pre-record dgn applied=false untuk audit kalau AI fail tetap ada
  // log. Update setelah AI sukses (charge tokens, attach suggestions).
  const opt = await prisma.lpOptimization.create({
    data: {
      lpId,
      userId: session.user.id,
      model: OPTIMIZE_MODEL,
      inputTokens: 0,
      outputTokens: 0,
      beforeHtml: lp.htmlContent,
      contextSummary: `signals=${signalsForPrompt.length}, visits=${recentVisits}`,
      applied: false,
    },
    select: { id: true },
  })

  try {
    const result = await runOptimization({
      htmlContent: lp.htmlContent,
      signals: signalsForPrompt,
      analytics,
    })

    // Charge token atomic — kalau race saldo turun di antaranya, balikin error.
    const charged = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.tokenBalance.updateMany({
        where: {
          userId: session.user.id,
          balance: { gte: result.platformTokensCharge },
        },
        data: {
          balance: { decrement: result.platformTokensCharge },
          totalUsed: { increment: result.platformTokensCharge },
        },
      })
      if (updateResult.count === 0) return null
      await tx.tokenTransaction.create({
        data: {
          userId: session.user.id,
          amount: -result.platformTokensCharge,
          type: 'USAGE',
          description: 'LP AI Optimization',
          reference: opt.id,
        },
      })
      return result.platformTokensCharge
    })

    if (charged === null) {
      await prisma.lpOptimization.update({
        where: { id: opt.id },
        data: {
          errorMessage: 'Saldo token habis di tengah proses (race). AI sudah sukses tapi tidak di-charge — tidak bisa apply.',
        },
      })
      return jsonError(
        'Saldo token habis selama proses AI. Top-up dulu lalu coba lagi.',
        402,
      )
    }

    // Update record dengan token + suggestions.
    await prisma.lpOptimization.update({
      where: { id: opt.id },
      data: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        // Snapshot harga saat call ini (Haiku 4.5). Audit historis tetap
        // akurat kalau kelak switch ke Sonnet untuk "Quality mode".
        inputPricePer1MUsd: 1,
        outputPricePer1MUsd: 5,
        providerCostUsd: result.providerCostUsd,
        providerCostRp: result.providerCostRp,
        platformTokensCharged: result.platformTokensCharge,
        suggestionsJson: result.suggestions,
        focusAreasJson: result.focusAreas,
        scoreBefore: result.scoreBefore,
        scoreAfter: result.scoreAfter,
        afterHtml: result.rewrittenHtml,
      },
    })

    return jsonOk({
      optimizationId: opt.id,
      suggestions: result.suggestions,
      focusAreas: result.focusAreas,
      scoreBefore: result.scoreBefore,
      scoreAfter: result.scoreAfter,
      rewrittenHtml: result.rewrittenHtml,
      cost: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        providerCostUsd: result.providerCostUsd,
        providerCostRp: result.providerCostRp,
        platformTokensCharged: result.platformTokensCharge,
      },
      preEstimate: estimate,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await prisma.lpOptimization
      .update({
        where: { id: opt.id },
        data: { errorMessage: msg.slice(0, 1000) },
      })
      .catch(() => {})

    if (err instanceof Anthropic.RateLimitError) {
      return jsonError('AI service sedang sibuk, coba lagi sebentar.', 429)
    }
    if (err instanceof Anthropic.APIError) {
      return jsonError(`AI service error: ${err.message}`, 502)
    }
    console.error('[POST /api/lp/:id/optimize] gagal:', err)
    return jsonError(msg || 'Terjadi kesalahan server', 500)
  }
}

// Build analytics context — visits, CTR, bounce, top CTAs, device split,
// funnel drop terbesar.
async function buildAnalyticsContext(lpId: string, since: Date) {
  const visits = await prisma.lpVisit.count({
    where: {
      landingPageId: lpId,
      createdAt: { gte: since },
      OR: [{ deviceType: { not: 'BOT' } }, { deviceType: null }],
    },
  })
  if (visits === 0) return null

  const [ctaCount, bounceCount, avgTime, scroll50, ctas, devices, formSubmits] =
    await Promise.all([
      prisma.lpVisit.count({
        where: {
          landingPageId: lpId,
          createdAt: { gte: since },
          ctaClicked: true,
          OR: [{ deviceType: { not: 'BOT' } }, { deviceType: null }],
        },
      }),
      prisma.lpVisit.count({
        where: {
          landingPageId: lpId,
          createdAt: { gte: since },
          bounced: true,
          OR: [{ deviceType: { not: 'BOT' } }, { deviceType: null }],
        },
      }),
      prisma.lpVisit.aggregate({
        where: {
          landingPageId: lpId,
          createdAt: { gte: since },
          timeOnPageSec: { not: null },
        },
        _avg: { timeOnPageSec: true },
      }),
      prisma.lpVisit.count({
        where: {
          landingPageId: lpId,
          createdAt: { gte: since },
          scrollMaxPct: { gte: 50 },
        },
      }),
      prisma.lpEvent.groupBy({
        by: ['eventValue'],
        where: {
          landingPageId: lpId,
          eventType: 'cta_click',
          createdAt: { gte: since },
          eventValue: { not: null },
        },
        _count: { _all: true },
        orderBy: { _count: { eventValue: 'desc' } },
        take: 5,
      }),
      prisma.lpVisit.groupBy({
        by: ['deviceType'],
        where: { landingPageId: lpId, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.lpEvent.count({
        where: {
          landingPageId: lpId,
          eventType: 'form_submit',
          createdAt: { gte: since },
        },
      }),
    ])

  const ctaRate = visits > 0 ? (ctaCount / visits) * 100 : 0
  const bounceRate = visits > 0 ? (bounceCount / visits) * 100 : 0

  // Identify funnel drop terbesar — between visit→scroll50 atau scroll50→cta.
  const dropScroll = visits > 0 ? ((visits - scroll50) / visits) * 100 : 0
  const dropCta = scroll50 > 0 ? ((scroll50 - ctaCount) / scroll50) * 100 : 0
  const dropForm = ctaCount > 0 ? ((ctaCount - formSubmits) / ctaCount) * 100 : 0
  let funnelDropAt: string | null = null
  const drops = [
    { stage: 'scroll 50% (visitor langsung bounce)', pct: dropScroll },
    { stage: 'klik CTA (visitor scroll tapi tidak klik)', pct: dropCta },
    { stage: 'submit form (klik CTA tapi tidak submit)', pct: dropForm },
  ]
  drops.sort((a, b) => b.pct - a.pct)
  if (drops[0] && drops[0].pct > 30) funnelDropAt = drops[0].stage

  return {
    visits,
    ctaRate,
    bounceRate,
    avgTimeSec: avgTime._avg.timeOnPageSec ?? 0,
    topCtas: ctas.map((c) => ({
      label: c.eventValue ?? '(unknown)',
      count: c._count._all,
    })),
    deviceSplit: devices.map((d) => ({
      key: d.deviceType ?? 'unknown',
      count: d._count._all,
    })),
    funnelDropAt,
  }
}
