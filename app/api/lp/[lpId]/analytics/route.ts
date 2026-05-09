// GET /api/lp/[lpId]/analytics?from=ISO&to=ISO
// Return aggregate analytics untuk LP Lab dashboard.
// Auth: session + LP ownership. Plan gate: POWER only.
//
// Output structure (semua dimensi dipakai oleh tabs di dashboard):
//   kpi: visits, uniqueVisitors, ctaClickRate, avgTimeSec, bounceRate, ctaClicks
//   funnel: 4-step (visit → scroll50 → cta → form)
//   sources: top UTM sources/mediums/campaigns + referrer hosts
//   devices: deviceType + browser + os breakdown
//   timeOfDay: 7×24 grid (dayOfWeek × hour) → count
//   ctas: top CTA labels + click count
//   geo: country breakdown (kalau ada)
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ lpId: string }>
}

// Cap query window 1 tahun supaya tidak query terlalu mahal.
const MAX_RANGE_MS = 365 * 24 * 60 * 60 * 1000

export async function GET(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { lpId } = await params

  // Validate ownership + plan gate.
  const lp = await prisma.landingPage.findUnique({
    where: { id: lpId },
    select: {
      id: true,
      userId: true,
      title: true,
      slug: true,
      isPublished: true,
      user: { select: { lpQuota: { select: { tier: true } } } },
    },
  })
  if (!lp) return jsonError('LP tidak ditemukan', 404)
  if (lp.userId !== session.user.id) return jsonError('Forbidden', 403)
  const tier = lp.user.lpQuota?.tier ?? 'FREE'
  if (tier !== 'POWER') {
    return jsonError(
      'LP Lab hanya tersedia untuk paket POWER. Upgrade dulu di /pricing',
      403,
    )
  }

  // Parse range. Default: 7 hari terakhir.
  const url = new URL(req.url)
  const fromRaw = url.searchParams.get('from')
  const toRaw = url.searchParams.get('to')
  const now = new Date()
  const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const from = fromRaw ? new Date(fromRaw) : defaultFrom
  const to = toRaw ? new Date(toRaw) : now
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return jsonError('Format tanggal invalid', 400)
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
    return jsonError('Rentang tanggal maksimal 1 tahun', 400)
  }

  try {
    // Single base where clause untuk visit-related queries.
    // Tidak pakai `as const` — Prisma WhereInput expect mutable array.
    const visitWhere = {
      landingPageId: lpId,
      createdAt: { gte: from, lte: to },
      // Filter bot dari KPI utama supaya angka realistic.
      OR: [{ deviceType: { not: 'BOT' } }, { deviceType: null }],
    }

    // Parallel queries — semua independent, lebih cepat.
    const [
      visitAggregate,
      uniqueVisitors,
      ctaClickedCount,
      bouncedCount,
      avgTimeAgg,
      scroll50Count,
      ctaClickEventCount,
      formSubmitEventCount,
      sources,
      mediums,
      campaigns,
      referers,
      devices,
      browsers,
      oses,
      countries,
      ctas,
      visitsByHour,
    ] = await Promise.all([
      prisma.lpVisit.count({ where: visitWhere }),
      prisma.lpVisit
        .findMany({
          where: visitWhere,
          select: { ipHash: true },
          distinct: ['ipHash'],
        })
        .then((rows) => rows.length),
      prisma.lpVisit.count({ where: { ...visitWhere, ctaClicked: true } }),
      prisma.lpVisit.count({ where: { ...visitWhere, bounced: true } }),
      prisma.lpVisit.aggregate({
        where: { ...visitWhere, timeOnPageSec: { not: null } },
        _avg: { timeOnPageSec: true },
      }),
      // Funnel — count distinct visit yg pernah scroll >=50% (bisa di-derive
      // dari LpVisit.scrollMaxPct atau LpEvent. Pakai LpVisit lebih cepat).
      prisma.lpVisit.count({
        where: { ...visitWhere, scrollMaxPct: { gte: 50 } },
      }),
      // CTA click events (count event, bukan visit) — supaya tahu total click
      // (1 visitor bisa klik CTA berkali-kali).
      prisma.lpEvent.count({
        where: {
          landingPageId: lpId,
          eventType: 'cta_click',
          createdAt: { gte: from, lte: to },
        },
      }),
      prisma.lpEvent.count({
        where: {
          landingPageId: lpId,
          eventType: 'form_submit',
          createdAt: { gte: from, lte: to },
        },
      }),

      // Sources / mediums / campaigns — group by + count, exclude null.
      prisma.lpVisit.groupBy({
        by: ['utmSource'],
        where: { ...visitWhere, utmSource: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { utmSource: 'desc' } },
        take: 10,
      }),
      prisma.lpVisit.groupBy({
        by: ['utmMedium'],
        where: { ...visitWhere, utmMedium: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { utmMedium: 'desc' } },
        take: 10,
      }),
      prisma.lpVisit.groupBy({
        by: ['utmCampaign'],
        where: { ...visitWhere, utmCampaign: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { utmCampaign: 'desc' } },
        take: 10,
      }),
      prisma.lpVisit.groupBy({
        by: ['referer'],
        where: { ...visitWhere, referer: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { referer: 'desc' } },
        take: 20,
      }),

      // Devices.
      prisma.lpVisit.groupBy({
        by: ['deviceType'],
        where: visitWhere,
        _count: { _all: true },
      }),
      prisma.lpVisit.groupBy({
        by: ['browser'],
        where: { ...visitWhere, browser: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { browser: 'desc' } },
        take: 10,
      }),
      prisma.lpVisit.groupBy({
        by: ['os'],
        where: { ...visitWhere, os: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { os: 'desc' } },
        take: 10,
      }),

      // Country (bisa null — Phase 1 belum geoip).
      prisma.lpVisit.groupBy({
        by: ['country'],
        where: { ...visitWhere, country: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { country: 'desc' } },
        take: 20,
      }),

      // Top CTA labels.
      prisma.lpEvent.groupBy({
        by: ['eventValue'],
        where: {
          landingPageId: lpId,
          eventType: 'cta_click',
          createdAt: { gte: from, lte: to },
          eventValue: { not: null },
        },
        _count: { _all: true },
        orderBy: { _count: { eventValue: 'desc' } },
        take: 10,
      }),

      // Time-of-day distribution: 7×24 grid. Postgres-specific raw query.
      prisma.$queryRawUnsafe<
        Array<{ dow: number; hour: number; cnt: number }>
      >(
        `SELECT EXTRACT(DOW FROM "createdAt")::int as dow,
                EXTRACT(HOUR FROM "createdAt" AT TIME ZONE 'Asia/Jakarta')::int as hour,
                COUNT(*)::int as cnt
         FROM "LpVisit"
         WHERE "landingPageId" = $1
           AND "createdAt" >= $2
           AND "createdAt" <= $3
           AND ("deviceType" IS NULL OR "deviceType" != 'BOT')
         GROUP BY dow, hour
         ORDER BY dow, hour`,
        lpId,
        from,
        to,
      ),
    ])

    const visits = visitAggregate
    const ctaRate = visits > 0 ? (ctaClickedCount / visits) * 100 : 0
    const bounceRate = visits > 0 ? (bouncedCount / visits) * 100 : 0
    const avgTimeSec = avgTimeAgg._avg.timeOnPageSec ?? 0

    // Reduce referer URLs → host (group lebih useful daripada full URL).
    const refererHosts = aggregateByHost(referers)

    return jsonOk({
      lp: {
        id: lp.id,
        title: lp.title,
        slug: lp.slug,
        isPublished: lp.isPublished,
      },
      range: { from: from.toISOString(), to: to.toISOString() },
      kpi: {
        visits,
        uniqueVisitors,
        ctaClickedCount,
        ctaRate,
        bouncedCount,
        bounceRate,
        avgTimeSec,
        ctaClickEvents: ctaClickEventCount,
        formSubmits: formSubmitEventCount,
      },
      funnel: [
        { step: 'Pengunjung', count: visits },
        { step: 'Scroll ≥50%', count: scroll50Count },
        { step: 'Klik CTA', count: ctaClickedCount },
        { step: 'Submit Form', count: formSubmitEventCount },
      ],
      sources: sources.map((s) => ({
        key: s.utmSource ?? '(direct)',
        count: s._count._all,
      })),
      mediums: mediums.map((s) => ({
        key: s.utmMedium ?? '(none)',
        count: s._count._all,
      })),
      campaigns: campaigns.map((s) => ({
        key: s.utmCampaign ?? '(none)',
        count: s._count._all,
      })),
      referrers: refererHosts,
      devices: devices.map((d) => ({
        key: d.deviceType ?? 'unknown',
        count: d._count._all,
      })),
      browsers: browsers.map((d) => ({
        key: d.browser ?? 'unknown',
        count: d._count._all,
      })),
      oses: oses.map((d) => ({
        key: d.os ?? 'unknown',
        count: d._count._all,
      })),
      countries: countries.map((d) => ({
        key: d.country ?? 'unknown',
        count: d._count._all,
      })),
      ctas: ctas.map((c) => ({
        label: c.eventValue ?? '(unknown)',
        count: c._count._all,
      })),
      // Time-of-day grid: array of { dow, hour, count } — frontend render
      // sebagai 7×24 cell heatmap. dow: 0=Sunday, 6=Saturday (Postgres convention).
      timeOfDay: visitsByHour.map((r) => ({
        dow: r.dow,
        hour: r.hour,
        count: r.cnt,
      })),
    })
  } catch (err) {
    console.error('[GET /api/lp/[lpId]/analytics] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

// Reduce daftar referer URL → group by host. Filter own host (referer dari
// sesama LP page navigation tidak menarik).
function aggregateByHost(
  rows: Array<{ referer: string | null; _count: { _all: number } }>,
): Array<{ key: string; count: number }> {
  const map = new Map<string, number>()
  for (const r of rows) {
    if (!r.referer) continue
    let host = '(direct)'
    try {
      host = new URL(r.referer).hostname
    } catch {
      host = r.referer.slice(0, 50)
    }
    map.set(host, (map.get(host) ?? 0) + r._count._all)
  }
  const sorted = [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
  return sorted.map(([key, count]) => ({ key, count }))
}
