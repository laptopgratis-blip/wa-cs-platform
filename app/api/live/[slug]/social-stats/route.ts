// GET /api/live/[slug]/social-stats — stats live untuk social proof di
// product detail sheet & featured card. Public endpoint (no auth) — sama
// dengan /api/live/[slug] route utama.
//
// Output: { viewersOpen, soldThisRoom, soldToday, recentBuyer }
//   viewersOpen   = LiveSession outcome=OPEN, startedAt > now-5min (active watcher)
//   soldThisRoom  = LiveLead status=CLOSED_WON total (lifetime)
//   soldToday     = LiveLead status=CLOSED_WON, createdAt > startOfToday WIB
//   recentBuyer   = LiveLead status=CLOSED_WON terbaru kalau < 60dtk; first name only.

import { jsonError, jsonOkCached } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Cache per-slug — endpoint di-poll tiap penonton dan isinya social proof
// agregat (toleran staleness beberapa detik). Tanpa cache, tiap poll = 1
// findUnique + 4 query count paralel; ratusan viewer = ratusan query/detik
// (kontributor insiden 2026-06-10). Process-local, valid karena 1 instance.
const STATS_TTL_MS = 5000
const statsCache = new Map<
  string,
  { body: Record<string, unknown> | null; expiresAt: number }
>()

// Sweep entri kedaluwarsa — Map jangan tumbuh terus per slug unik.
const SWEEP_INTERVAL_MS = 5 * 60_000
let lastSweep = 0
function maybeSweep(): void {
  const now = Date.now()
  if (now - lastSweep < SWEEP_INTERVAL_MS) return
  lastSweep = now
  for (const [slug, e] of statsCache) {
    if (e.expiresAt <= now) statsCache.delete(slug)
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  maybeSweep()
  const hit = statsCache.get(slug)
  if (hit && hit.expiresAt > Date.now()) {
    if (!hit.body) return jsonError('Room tidak ditemukan', 404)
    return jsonOkCached(hit.body, { sMaxage: 5, swr: 10 })
  }

  const room = await prisma.liveRoom.findUnique({
    where: { slug },
    select: { id: true, isActive: true },
  })
  if (!room || !room.isActive) {
    // Negative cache — room mati/slug salah jangan hammer DB.
    statsCache.set(slug, { body: null, expiresAt: Date.now() + STATS_TTL_MS })
    return jsonError('Room tidak ditemukan', 404)
  }

  const now = new Date()
  const fiveMinAgo = new Date(now.getTime() - 5 * 60_000)
  // Start of today di WIB (UTC+7) — pakai approximation: subtract 7h, ambil
  // tanggal UTC, tambah balik 0:00 WIB = 17:00 UTC hari sebelumnya.
  const wibOffsetMs = 7 * 60 * 60_000
  const startOfTodayWib = new Date(
    Math.floor((now.getTime() + wibOffsetMs) / 86_400_000) * 86_400_000 - wibOffsetMs,
  )
  const sixtySecAgo = new Date(now.getTime() - 60_000)

  const [viewersOpen, soldThisRoom, soldToday, recent] = await Promise.all([
    prisma.liveSession.count({
      where: {
        liveRoomId: room.id,
        outcome: 'OPEN',
        startedAt: { gt: fiveMinAgo },
      },
    }),
    prisma.liveLead.count({
      where: { liveRoomId: room.id, status: 'CLOSED_WON' },
    }),
    prisma.liveLead.count({
      where: {
        liveRoomId: room.id,
        status: 'CLOSED_WON',
        createdAt: { gte: startOfTodayWib },
      },
    }),
    prisma.liveLead.findFirst({
      where: {
        liveRoomId: room.id,
        status: 'CLOSED_WON',
        createdAt: { gt: sixtySecAgo },
      },
      orderBy: { createdAt: 'desc' },
      select: { customerName: true, productInterest: true, createdAt: true },
    }),
  ])

  const recentBuyer = recent
    ? {
        // First name only — privacy: "Siska Wijaya" → "Siska"
        name: recent.customerName.split(/\s+/)[0] ?? recent.customerName,
        productInterest: recent.productInterest,
        agoSec: Math.max(0, Math.round((now.getTime() - recent.createdAt.getTime()) / 1000)),
      }
    : null

  const body = {
    viewersOpen,
    soldThisRoom,
    soldToday,
    recentBuyer,
  }
  statsCache.set(slug, { body, expiresAt: Date.now() + STATS_TTL_MS })
  return jsonOkCached(body, { sMaxage: 5, swr: 10 })
}
