// LP Score calculator — compute 0-100 score per LP berdasarkan 6 dimensi.
//
// Bobot total: 100. Per-dimensi max: 15+20+25+15+15+10 = 100.
//   - Traffic Quality   (15) : bounce inverted + source diversity
//   - Engagement        (20) : avg scroll depth + avg time on page
//   - Conversion        (25) : CTA click rate + form submit bonus
//   - Content Quality   (15) : HTML length sweet spot + heading + image + CTA count
//   - Technical         (15) : HTML size (load proxy) + mobile share
//   - Customer Sentiment(10) : positive vs negative ratio dari chat signals
//
// Confidence threshold: kalau visits < MIN_CONFIDENCE_VISITS (30), kasih
// flag confidence:'low' di breakdown — UI tampil disclaimer.

import { prisma } from '@/lib/prisma'

export const SCORE_WEIGHTS = {
  traffic: 15,
  engagement: 20,
  conversion: 25,
  content: 15,
  technical: 15,
  sentiment: 10,
} as const

export const SCORE_LABELS = {
  traffic: 'Traffic Quality',
  engagement: engagement_label(),
  conversion: 'Conversion',
  content: 'Content Quality',
  technical: 'Technical',
  sentiment: 'Customer Sentiment',
} as const
function engagement_label() {
  return 'Engagement'
}

const DEFAULT_PERIOD_DAYS = 30
const MIN_CONFIDENCE_VISITS = 30

export interface DimensionScore {
  score: number // 0..max
  max: number
  detail: string // human-readable explanation untuk UI tooltip
}

export interface ScoreBreakdown {
  traffic: DimensionScore
  engagement: DimensionScore
  conversion: DimensionScore
  content: DimensionScore
  technical: DimensionScore
  sentiment: DimensionScore
}

export interface ComputeResult {
  total: number
  breakdown: ScoreBreakdown
  sampleVisits: number
  confidence: 'low' | 'medium' | 'high'
  periodDays: number
}

export async function computeLpScore(
  lpId: string,
  periodDays: number = DEFAULT_PERIOD_DAYS,
): Promise<ComputeResult> {
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000)

  const lp = await prisma.landingPage.findUnique({
    where: { id: lpId },
    select: { htmlContent: true },
  })
  const html = lp?.htmlContent ?? ''

  // Parallel fetch semua data yg dibutuhkan.
  const [
    visits,
    bounced,
    sourcesDistinct,
    avgScroll,
    avgTime,
    ctaCount,
    formSubmits,
    deviceMobile,
    deviceTotal,
    signals,
  ] = await Promise.all([
    prisma.lpVisit.count({
      where: {
        landingPageId: lpId,
        createdAt: { gte: since },
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
    prisma.lpVisit
      .findMany({
        where: {
          landingPageId: lpId,
          createdAt: { gte: since },
          utmSource: { not: null },
        },
        select: { utmSource: true },
        distinct: ['utmSource'],
      })
      .then((rows) => rows.length),
    prisma.lpVisit.aggregate({
      where: {
        landingPageId: lpId,
        createdAt: { gte: since },
        scrollMaxPct: { not: null },
      },
      _avg: { scrollMaxPct: true },
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
        ctaClicked: true,
        OR: [{ deviceType: { not: 'BOT' } }, { deviceType: null }],
      },
    }),
    prisma.lpEvent.count({
      where: {
        landingPageId: lpId,
        eventType: 'form_submit',
        createdAt: { gte: since },
      },
    }),
    prisma.lpVisit.count({
      where: {
        landingPageId: lpId,
        createdAt: { gte: since },
        deviceType: 'MOBILE',
      },
    }),
    prisma.lpVisit.count({
      where: {
        landingPageId: lpId,
        createdAt: { gte: since },
        deviceType: { not: null },
        OR: [{ deviceType: { not: 'BOT' } }, { deviceType: null }],
      },
    }),
    prisma.lpChatSignal.findMany({
      where: { landingPageId: lpId, periodDays },
      select: { category: true, count: true },
    }),
  ])

  const bounceRate = visits > 0 ? bounced / visits : 0.5
  const ctaRate = visits > 0 ? ctaCount / visits : 0
  const avgScrollPct = avgScroll._avg.scrollMaxPct ?? 0
  const avgTimeSec = avgTime._avg.timeOnPageSec ?? 0
  const mobileShare = deviceTotal > 0 ? deviceMobile / deviceTotal : 0

  // ── Dimensi 1: Traffic Quality (15) ─────────────────────────────────────
  // Bounce inverted (10): score = 10 × (1 - bounceRate). 0% bounce → 10pt.
  // Source diversity (5): 0 source = 0pt, 1 = 1pt, 2-3 = 3pt, 4+ = 5pt.
  const trafficBouncePart = (1 - bounceRate) * 10
  const trafficSrcPart =
    sourcesDistinct === 0 ? 0 : sourcesDistinct === 1 ? 1 : sourcesDistinct >= 4 ? 5 : 3
  const trafficScore = Math.round(Math.min(15, trafficBouncePart + trafficSrcPart))
  const trafficDetail =
    visits === 0
      ? 'Belum ada visit untuk dihitung'
      : `Bounce ${(bounceRate * 100).toFixed(1)}%, ${sourcesDistinct} source unik`

  // ── Dimensi 2: Engagement (20) ──────────────────────────────────────────
  // Scroll depth (12): score = 12 × (avgScroll/100). 100% avg → 12pt.
  // Time on page (8): cap 60s = 8pt, 0s = 0pt.
  const scrollPart = (avgScrollPct / 100) * 12
  const timePart = Math.min(8, (avgTimeSec / 60) * 8)
  const engagementScore = Math.round(Math.min(20, scrollPart + timePart))
  const engagementDetail =
    visits === 0
      ? 'Belum ada visit'
      : `Avg scroll ${avgScrollPct.toFixed(0)}%, avg time ${Math.round(avgTimeSec)}s`

  // ── Dimensi 3: Conversion (25) ──────────────────────────────────────────
  // CTA click rate (20): 15% CTR = 20pt (cap), 0% = 0pt.
  // Form submits (5): >0 → 3pt, >5 → 5pt (kalau LP tidak ada form, sumbang 0).
  const ctaPart = Math.min(20, (ctaRate / 0.15) * 20)
  const formPart = formSubmits === 0 ? 0 : formSubmits >= 5 ? 5 : 3
  const conversionScore = Math.round(Math.min(25, ctaPart + formPart))
  const conversionDetail =
    visits === 0
      ? 'Belum ada visit'
      : `CTR ${(ctaRate * 100).toFixed(1)}%, ${formSubmits} form submit`

  // ── Dimensi 4: Content Quality (15) ─────────────────────────────────────
  // Heuristic dari HTML structure — tidak butuh AI eval (Phase 5 fokus
  // objektif metrics). AI Content eval Phase 6 nanti via opsional button.
  const htmlLen = html.length
  // Sweet spot: 3K-15K char. Penalty di luar.
  let lenPart: number
  if (htmlLen < 1000) lenPart = 1 // terlalu pendek
  else if (htmlLen < 3000) lenPart = 3
  else if (htmlLen < 15000) lenPart = 6 // ideal
  else if (htmlLen < 25000) lenPart = 4
  else lenPart = 2 // terlalu panjang
  // Heading hierarchy: count h1..h3 — minimal 3 heading dianggap struktur baik.
  const hCount = (html.match(/<h[1-3][^>]*>/gi) ?? []).length
  const headingPart = hCount === 0 ? 0 : hCount >= 3 ? 4 : 2
  // Image count: di-pakai untuk visual support.
  const imgCount = (html.match(/<img[^>]+>/gi) ?? []).length
  const imgPart = imgCount === 0 ? 0 : imgCount >= 2 ? 3 : 2
  // CTA detection: count <a> ke wa.me / button / data-lp-cta.
  const ctaInHtml = countCtaTags(html)
  const ctaContentPart = ctaInHtml === 0 ? 0 : ctaInHtml >= 2 ? 2 : 1
  const contentScore = Math.round(
    Math.min(15, lenPart + headingPart + imgPart + ctaContentPart),
  )
  const contentDetail = `${(htmlLen / 1000).toFixed(1)}K char · ${hCount} heading · ${imgCount} gambar · ${ctaInHtml} CTA`

  // ── Dimensi 5: Technical (15) ───────────────────────────────────────────
  // HTML size proxy untuk load speed (8): <30KB = 8pt, >100KB = 0pt linear.
  const sizeKb = htmlLen / 1000
  const sizePart =
    sizeKb < 30 ? 8 : sizeKb > 100 ? 0 : Math.round(8 - ((sizeKb - 30) / 70) * 8)
  // Mobile share (7): 50%+ mobile audience = baik LP cocok mobile-first → 7pt.
  // Kalau tidak ada visit / belum tau → neutral 4pt (tidak punish).
  const mobilePart = deviceTotal === 0 ? 4 : Math.round(7 * Math.min(1, mobileShare * 1.5))
  const technicalScore = Math.round(Math.min(15, sizePart + mobilePart))
  const technicalDetail = `${sizeKb.toFixed(0)}KB HTML · ${(mobileShare * 100).toFixed(0)}% mobile`

  // ── Dimensi 6: Customer Sentiment (10) ──────────────────────────────────
  // Ratio: cocok_kebutuhan = positive. Sisanya negative.
  // Skor: 10 × pos/(pos+neg). Default neutral 5 kalau tidak ada signal.
  const sigMap = new Map(signals.map((s) => [s.category, s.count]))
  const positive = sigMap.get('cocok_kebutuhan') ?? 0
  const negative =
    (sigMap.get('harga_mahal') ?? 0) +
    (sigMap.get('gak_paham') ?? 0) +
    (sigMap.get('gak_percaya') ?? 0) +
    (sigMap.get('ragu_kualitas') ?? 0) +
    (sigMap.get('gak_yakin') ?? 0)
  let sentimentScore: number
  let sentimentDetail: string
  if (positive + negative === 0) {
    sentimentScore = 5
    sentimentDetail = 'Belum ada signal customer'
  } else {
    sentimentScore = Math.round((positive / (positive + negative)) * 10)
    sentimentDetail = `${positive} positif vs ${negative} negatif`
  }

  // ── Total ────────────────────────────────────────────────────────────────
  const total = Math.min(
    100,
    trafficScore + engagementScore + conversionScore + contentScore + technicalScore + sentimentScore,
  )

  const confidence: 'low' | 'medium' | 'high' =
    visits < MIN_CONFIDENCE_VISITS
      ? 'low'
      : visits < MIN_CONFIDENCE_VISITS * 5
        ? 'medium'
        : 'high'

  return {
    total,
    breakdown: {
      traffic: { score: trafficScore, max: 15, detail: trafficDetail },
      engagement: { score: engagementScore, max: 20, detail: engagementDetail },
      conversion: { score: conversionScore, max: 25, detail: conversionDetail },
      content: { score: contentScore, max: 15, detail: contentDetail },
      technical: { score: technicalScore, max: 15, detail: technicalDetail },
      sentiment: { score: sentimentScore, max: 10, detail: sentimentDetail },
    },
    sampleVisits: visits,
    confidence,
    periodDays,
  }
}

function countCtaTags(html: string): number {
  let count = 0
  // data-lp-cta attribute
  count += (html.match(/data-lp-cta\s*=/gi) ?? []).length
  // wa.me / api.whatsapp.com link
  count += (html.match(/href\s*=\s*["'][^"']*(?:wa\.me|api\.whatsapp\.com)/gi) ?? [])
    .length
  // button tag (rough)
  count += (html.match(/<button[^>]*>/gi) ?? []).length
  return count
}

export async function persistScore(
  lpId: string,
  result: ComputeResult,
  trigger: 'manual' | 'cron' | 'apply' = 'cron',
): Promise<string> {
  const created = await prisma.lpScore.create({
    data: {
      landingPageId: lpId,
      total: result.total,
      breakdownJson: result.breakdown as unknown as object,
      periodDays: result.periodDays,
      sampleVisits: result.sampleVisits,
      trigger,
    },
    select: { id: true },
  })
  return created.id
}
