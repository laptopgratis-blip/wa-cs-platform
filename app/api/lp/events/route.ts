// POST /api/lp/events — public, no auth. Tracker JS di /p/<slug> kirim
// batch event di sini. Server insert ke LpEvent + update LpVisit aggregates
// (scrollMaxPct, timeOnPageSec, ctaClicked, bounced).
//
// Rate limit: per-IP-per-LP, 60 batch/menit (cukup untuk visit aktif).
// Throttle pakai LpEvent count (sama pattern dgn /p/<slug>).
//
// Privacy: server tidak terima data PII; client tidak kirim mouse path
// granular, hanya event types + label.
import crypto from 'node:crypto'

import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { parseUa } from '@/lib/ua-parse'

const RATE_LIMIT_PER_MIN = 60
const MAX_EVENTS_PER_BATCH = 30
// Allowlist event types — guard against arbitrary values from compromised tracker.
const ALLOWED_EVENT_TYPES = new Set([
  'pageview',
  'scroll_25',
  'scroll_50',
  'scroll_75',
  'scroll_100',
  'cta_click',
  'outbound_click',
  'form_submit',
  'time_milestone',
  'page_unload',
  'click_pos', // Phase 3 — for heatmap bin aggregation
])

interface IncomingEvent {
  t: string // type
  v?: string | null // value
  sp?: number | null // scrollPct
  ts?: number | null // timeOnPageSec
  // Heatmap-specific (only on 'click_pos' / 'cta_click' / 'outbound_click').
  cx?: number | null // pageX in document coords (px)
  cy?: number | null // pageY
  pw?: number | null // page width when clicked
  ph?: number | null // page height when clicked
}

interface IncomingBody {
  lpId?: string
  events?: IncomingEvent[]
  utm?: { source?: string | null; medium?: string | null; campaign?: string | null } | null
}

function hashIp(ip: string): string {
  const salt = process.env.IP_SALT ?? 'hulao-default-ip-salt-rotate-me'
  return crypto.createHash('sha256').update(`${ip}|${salt}`).digest('hex')
}

function clientIpFrom(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for')
  if (fwd) {
    const first = fwd.split(',')[0]?.trim()
    if (first) return first
  }
  return headers.get('x-real-ip') ?? 'unknown'
}

// Bounce heuristic: visit yg scroll <25% AND time-on-page <10 detik.
// Kalau salah satu lewat, dianggap engaged (bounced=false).
function isStillBounced(scrollPct: number | null | undefined, timeSec: number | null | undefined): boolean {
  const s = scrollPct ?? 0
  const t = timeSec ?? 0
  return s < 25 && t < 10
}

export async function POST(req: Request) {
  let body: IncomingBody
  try {
    body = (await req.json()) as IncomingBody
  } catch {
    return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 })
  }

  const lpId = typeof body.lpId === 'string' ? body.lpId : null
  const events = Array.isArray(body.events) ? body.events : []
  if (!lpId || events.length === 0) {
    // Empty batch = no-op (acceptable — bisa jadi tracker boot tapi belum ada event).
    return NextResponse.json({ success: true, processed: 0 })
  }
  // Cap event count per batch — defensive against abusive client.
  const batch = events.slice(0, MAX_EVENTS_PER_BATCH)

  // Validate LP exists (cheap query — by id index).
  const lp = await prisma.landingPage.findUnique({
    where: { id: lpId },
    select: { id: true, isPublished: true },
  })
  if (!lp || !lp.isPublished) {
    return NextResponse.json({ success: false, error: 'lp not found' }, { status: 404 })
  }

  const ipHash = hashIp(clientIpFrom(req.headers))
  const userAgent = req.headers.get('user-agent') ?? ''
  const parsedUa = parseUa(userAgent)

  // Rate limit — count LpEvent per (lpId, ipHash) di 60 detik terakhir.
  const oneMinuteAgo = new Date(Date.now() - 60_000)
  const recentCount = await prisma.lpEvent.count({
    where: {
      landingPageId: lpId,
      ipHash,
      createdAt: { gte: oneMinuteAgo },
    },
  })
  if (recentCount >= RATE_LIMIT_PER_MIN) {
    return NextResponse.json(
      { success: false, error: 'rate limited' },
      { status: 429, headers: { 'Retry-After': '60' } },
    )
  }

  // Resolve LpVisit terkait — match by (lpId, ipHash) terbaru dalam 30 menit.
  // Kenapa 30 menit? Itu jendela "session" wajar untuk visit yang masih aktif.
  // Kalau tidak ditemukan (tracker boot setelah server LpVisit cleanup, atau
  // ipHash beda karena IP rotasi mobile), tetap insert event tanpa visitId.
  const sessionCutoff = new Date(Date.now() - 30 * 60_000)
  const matchedVisit = await prisma.lpVisit.findFirst({
    where: {
      landingPageId: lpId,
      ipHash,
      createdAt: { gte: sessionCutoff },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, scrollMaxPct: true, timeOnPageSec: true, ctaClicked: true, bounced: true },
  })

  // Insert events. Skip 'pageview' (duplicate dengan LpVisit row di /p/<slug>).
  // Skip 'click_pos' di LpEvent — itu hanya untuk heatmap aggregation, tidak
  // perlu granular log (volume bisa tinggi, akan bloat tabel).
  const toInsert = batch
    .filter((e) => e && typeof e.t === 'string' && ALLOWED_EVENT_TYPES.has(e.t))
    .filter((e) => e.t !== 'pageview' && e.t !== 'click_pos')
    .map((e) => ({
      landingPageId: lpId,
      visitId: matchedVisit?.id ?? null,
      eventType: e.t,
      eventValue: typeof e.v === 'string' ? e.v.slice(0, 200) : null,
      scrollPct: typeof e.sp === 'number' && e.sp >= 0 && e.sp <= 100 ? Math.round(e.sp) : null,
      timeOnPageSec:
        typeof e.ts === 'number' && e.ts >= 0 && e.ts <= 60 * 60 * 12 ? Math.round(e.ts) : null,
      ipHash,
      deviceType: parsedUa.deviceType,
    }))

  if (toInsert.length > 0) {
    await prisma.lpEvent.createMany({ data: toInsert }).catch((err) => {
      console.error('[POST /api/lp/events] createMany gagal:', err)
    })
  }

  // Heatmap aggregation — semua event yg punya cx/cy (click_pos + CTA + outbound).
  // Skip BOT supaya heatmap real visitor only.
  if (parsedUa.deviceType && parsedUa.deviceType !== 'BOT') {
    const heatmapEvents = batch.filter(
      (e) =>
        typeof e.cx === 'number' &&
        typeof e.cy === 'number' &&
        typeof e.pw === 'number' &&
        typeof e.ph === 'number' &&
        e.pw > 0 &&
        e.ph > 0,
    )
    // Bin per (xCell, yCell) — accumulate count per bin di batch ini, baru
    // upsert per unique cell. Mengurangi jumlah DB query.
    const cellCounts = new Map<string, number>()
    for (const e of heatmapEvents) {
      const xPct = (e.cx! / e.pw!) * 100
      const yPct = (e.cy! / e.ph!) * 100
      const xCell = Math.max(0, Math.min(99, Math.floor(xPct)))
      const yCell = Math.max(0, Math.min(99, Math.floor(yPct)))
      const key = `${xCell}:${yCell}`
      cellCounts.set(key, (cellCounts.get(key) ?? 0) + 1)
    }
    if (cellCounts.size > 0) {
      // Upsert per cell — tidak bisa createMany karena unique constraint.
      // Best-effort: kalau gagal satu, lanjut ke berikutnya. Volume kecil
      // (max ~30 per batch) — overhead acceptable.
      const ops = Array.from(cellCounts.entries()).map(([key, count]) => {
        const [x, y] = key.split(':').map(Number) as [number, number]
        return prisma.lpHeatmapBin
          .upsert({
            where: {
              landingPageId_deviceType_xCell_yCell: {
                landingPageId: lpId,
                deviceType: parsedUa.deviceType!,
                xCell: x,
                yCell: y,
              },
            },
            update: { count: { increment: count } },
            create: {
              landingPageId: lpId,
              deviceType: parsedUa.deviceType!,
              xCell: x,
              yCell: y,
              count,
            },
          })
          .catch((err) => {
            console.error('[POST /api/lp/events] heatmap upsert gagal:', err)
            return null
          })
      })
      await Promise.all(ops)
    }
  }

  // Update LpVisit aggregates kalau ketemu visit-nya.
  if (matchedVisit) {
    let maxScroll = matchedVisit.scrollMaxPct ?? 0
    let maxTime = matchedVisit.timeOnPageSec ?? 0
    let cta = matchedVisit.ctaClicked
    let utmUpdate: {
      utmSource?: string | null
      utmMedium?: string | null
      utmCampaign?: string | null
    } = {}
    for (const e of batch) {
      if (typeof e.sp === 'number' && e.sp > maxScroll) maxScroll = Math.min(100, Math.round(e.sp))
      if (typeof e.ts === 'number' && e.ts > maxTime) maxTime = Math.min(60 * 60 * 12, Math.round(e.ts))
      if (e.t === 'cta_click') cta = true
    }
    // UTM dari URL (kalau visitor datang dari campaign), fire sekali via
    // batch pertama — overwrite kalau sudah ada nilai non-null.
    if (body.utm) {
      const u = body.utm
      if (typeof u.source === 'string') utmUpdate.utmSource = u.source.slice(0, 100)
      if (typeof u.medium === 'string') utmUpdate.utmMedium = u.medium.slice(0, 100)
      if (typeof u.campaign === 'string') utmUpdate.utmCampaign = u.campaign.slice(0, 100)
    }
    const stillBounced = isStillBounced(maxScroll, maxTime) && !cta
    await prisma.lpVisit
      .update({
        where: { id: matchedVisit.id },
        data: {
          scrollMaxPct: maxScroll,
          timeOnPageSec: maxTime,
          ctaClicked: cta,
          bounced: stillBounced,
          lastEventAt: new Date(),
          ...utmUpdate,
        },
      })
      .catch((err) => {
        console.error('[POST /api/lp/events] visit update gagal:', err)
      })
  }

  return NextResponse.json({
    success: true,
    processed: toInsert.length,
    visitMatched: !!matchedVisit,
  })
}
