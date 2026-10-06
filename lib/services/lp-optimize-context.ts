// Konteks input optimasi LP AI — analytics 30 hari + customer signals chat WA.
//
// Dipindah dari route POST /api/lp/[lpId]/optimize (2026-10-06) karena job
// background (`lp-optimize-job.ts`) yang kini membangun prompt, bukan route.
import { prisma } from '@/lib/prisma'
import {
  SIGNAL_LABELS,
  type SignalCategory,
} from '@/lib/services/lp-chat-signals'

const CONTEXT_WINDOW_DAYS = 30
const MAX_SIGNALS_FOR_ESTIMATE = 30
const MAX_SIGNALS_FOR_PROMPT = 5
// Funnel drop di bawah persentase ini dianggap wajar — tidak disebut ke AI.
const FUNNEL_DROP_THRESHOLD_PCT = 30

export interface OptimizeSignal {
  category: string
  label: string
  count: number
  samples: string[]
}

export interface OptimizeAnalytics {
  visits: number
  ctaRate: number
  bounceRate: number
  avgTimeSec: number
  topCtas: Array<{ label: string; count: number }>
  deviceSplit: Array<{ key: string; count: number }>
  funnelDropAt: string | null
}

export interface OptimizeEstimateInputs {
  // Jumlah pesan signal (dibatasi) — dipakai estimateOptimizationCost.
  signalsCount: number
  recentVisits: number
  hasAnalytics: boolean
}

export interface OptimizeContext extends OptimizeEstimateInputs {
  signals: OptimizeSignal[]
  analytics: OptimizeAnalytics | null
}

function contextSince(): Date {
  return new Date(Date.now() - CONTEXT_WINDOW_DAYS * 24 * 60 * 60 * 1000)
}

// Ringan — cukup untuk estimasi biaya & precheck saldo di route.
export async function loadOptimizeEstimateInputs(
  lpId: string,
): Promise<OptimizeEstimateInputs> {
  const since = contextSince()
  const [signalsSum, recentVisits] = await Promise.all([
    prisma.lpChatSignal
      .aggregate({
        where: { landingPageId: lpId, periodDays: CONTEXT_WINDOW_DAYS },
        _sum: { count: true },
      })
      .then((r) => r._sum.count ?? 0)
      .catch(() => 0),
    prisma.lpVisit.count({
      where: { landingPageId: lpId, createdAt: { gte: since } },
    }),
  ])
  return {
    signalsCount: Math.min(signalsSum, MAX_SIGNALS_FOR_ESTIMATE),
    recentVisits,
    hasAnalytics: recentVisits > 0,
  }
}

// Lengkap — dipakai job saat membangun prompt AI.
export async function buildOptimizeContext(
  lpId: string,
): Promise<OptimizeContext> {
  const since = contextSince()
  const [inputs, signals, analytics] = await Promise.all([
    loadOptimizeEstimateInputs(lpId),
    prisma.lpChatSignal.findMany({
      where: { landingPageId: lpId, periodDays: CONTEXT_WINDOW_DAYS },
      orderBy: { count: 'desc' },
      take: MAX_SIGNALS_FOR_PROMPT,
    }),
    buildAnalyticsContext(lpId, since),
  ])

  return {
    ...inputs,
    analytics,
    signals: signals
      .filter((s) => s.count > 0)
      .map((s) => ({
        category: s.category,
        label: SIGNAL_LABELS[s.category as SignalCategory] ?? s.category,
        count: s.count,
        samples: Array.isArray(s.sampleQuotes)
          ? (s.sampleQuotes as string[])
          : [],
      })),
  }
}

const NOT_BOT = [{ deviceType: { not: 'BOT' } }, { deviceType: null }]

// Analytics — visits, CTR, bounce, top CTA, device split, funnel drop terbesar.
async function buildAnalyticsContext(
  lpId: string,
  since: Date,
): Promise<OptimizeAnalytics | null> {
  const visitWhere = { landingPageId: lpId, createdAt: { gte: since } }
  const visits = await prisma.lpVisit.count({
    where: { ...visitWhere, OR: NOT_BOT },
  })
  if (visits === 0) return null

  const [ctaCount, bounceCount, avgTime, scroll50, ctas, devices, formSubmits] =
    await Promise.all([
      prisma.lpVisit.count({
        where: { ...visitWhere, ctaClicked: true, OR: NOT_BOT },
      }),
      prisma.lpVisit.count({
        where: { ...visitWhere, bounced: true, OR: NOT_BOT },
      }),
      prisma.lpVisit.aggregate({
        where: { ...visitWhere, timeOnPageSec: { not: null } },
        _avg: { timeOnPageSec: true },
      }),
      prisma.lpVisit.count({
        where: { ...visitWhere, scrollMaxPct: { gte: 50 } },
      }),
      prisma.lpEvent.groupBy({
        by: ['eventValue'],
        where: {
          ...visitWhere,
          eventType: 'cta_click',
          eventValue: { not: null },
        },
        _count: { _all: true },
        orderBy: { _count: { eventValue: 'desc' } },
        take: 5,
      }),
      prisma.lpVisit.groupBy({
        by: ['deviceType'],
        where: visitWhere,
        _count: { _all: true },
      }),
      prisma.lpEvent.count({
        where: { ...visitWhere, eventType: 'form_submit' },
      }),
    ])

  return {
    visits,
    ctaRate: (ctaCount / visits) * 100,
    bounceRate: (bounceCount / visits) * 100,
    avgTimeSec: avgTime._avg.timeOnPageSec ?? 0,
    topCtas: ctas.map((c) => ({
      label: c.eventValue ?? '(unknown)',
      count: c._count._all,
    })),
    deviceSplit: devices.map((d) => ({
      key: d.deviceType ?? 'unknown',
      count: d._count._all,
    })),
    funnelDropAt: biggestFunnelDrop({
      visits,
      scroll50,
      ctaCount,
      formSubmits,
    }),
  }
}

// Tahap funnel dengan drop terbesar (visit→scroll50→CTA→form), null kalau wajar.
function biggestFunnelDrop(f: {
  visits: number
  scroll50: number
  ctaCount: number
  formSubmits: number
}): string | null {
  const pct = (from: number, to: number) =>
    from > 0 ? ((from - to) / from) * 100 : 0
  const drops = [
    {
      stage: 'scroll 50% (visitor langsung bounce)',
      pct: pct(f.visits, f.scroll50),
    },
    {
      stage: 'klik CTA (visitor scroll tapi tidak klik)',
      pct: pct(f.scroll50, f.ctaCount),
    },
    {
      stage: 'submit form (klik CTA tapi tidak submit)',
      pct: pct(f.ctaCount, f.formSubmits),
    },
  ]
  const top = [...drops].sort((a, b) => b.pct - a.pct)[0]
  return top && top.pct > FUNNEL_DROP_THRESHOLD_PCT ? top.stage : null
}
