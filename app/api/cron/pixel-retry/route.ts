// POST or GET /api/cron/pixel-retry
//
// Cron retry pixel events yang gagal — re-fire max 3x dalam 24 jam terakhir.
// Pakai firePixelEventForOrder yang punya dedup: kalau sebelumnya gagal di
// Meta tapi sudah berhasil di TikTok, hanya yang gagal yang di-retry.
//
// Auth: header `x-cron-secret` atau query `?secret=` == CRON_SECRET.
// Pattern sama dengan cron lain (lihat /api/cron/order-auto-cancel).
import { NextResponse } from 'next/server'

import { firePixelEventForOrder, type PixelEventName } from '@/lib/services/pixel-fire'
import { prisma } from '@/lib/prisma'

const MAX_RETRY_PER_RUN = 50  // batasi supaya tidak overload sekali jalan
const MAX_RETRY_COUNT = 3

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const url = new URL(req.url)
  const queryToken = url.searchParams.get('secret')
  const headerToken = req.headers.get('x-cron-secret')
  return queryToken === expected || headerToken === expected
}

async function handle(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { success: false, error: 'unauthorized' },
      { status: 401 },
    )
  }

  const startedAt = Date.now()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)

  // Kandidat: latest failed log per (orderId, eventName, pixelId) dengan
  // retryCount < MAX. Pakai Prisma findMany + dedupe in-memory karena
  // distinctOn agak terbatas di postgres tanpa raw query.
  const candidates = await prisma.pixelEventLog.findMany({
    where: {
      succeeded: false,
      retryCount: { lt: MAX_RETRY_COUNT },
      createdAt: { gte: cutoff },
      orderId: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    take: MAX_RETRY_PER_RUN * 4,  // ambil banyak, dedupe nanti
    select: {
      id: true,
      orderId: true,
      eventName: true,
      pixelId: true,
      retryCount: true,
    },
  })

  // Dedupe: per (orderId, eventName) ambil log paling baru. firePixelEventForOrder
  // sudah handle multi-pixel internally — tidak perlu dispatch per-pixel.
  const seen = new Set<string>()
  type RetryUnit = { orderId: string; eventName: string; logIds: string[] }
  const units: RetryUnit[] = []
  for (const c of candidates) {
    if (!c.orderId) continue
    const key = `${c.orderId}:${c.eventName}`
    if (seen.has(key)) {
      const u = units.find(
        (x) => x.orderId === c.orderId && x.eventName === c.eventName,
      )
      if (u) u.logIds.push(c.id)
      continue
    }
    seen.add(key)
    units.push({
      orderId: c.orderId,
      eventName: c.eventName,
      logIds: [c.id],
    })
    if (units.length >= MAX_RETRY_PER_RUN) break
  }

  let retried = 0
  let totalSucceeded = 0
  for (const unit of units) {
    try {
      const result = await firePixelEventForOrder({
        orderId: unit.orderId,
        eventName: unit.eventName as PixelEventName,
        source: 'SERVER',
      })
      retried++
      totalSucceeded += result.succeeded
      // Increment retryCount untuk semua log lama yang related supaya
      // dedup boundary di run berikutnya akurat.
      await prisma.pixelEventLog
        .updateMany({
          where: { id: { in: unit.logIds } },
          data: { retryCount: { increment: 1 } },
        })
        .catch(() => {})
    } catch (err) {
      console.error(
        `[cron/pixel-retry] gagal retry ${unit.orderId}/${unit.eventName}:`,
        err,
      )
    }
  }

  return NextResponse.json({
    success: true,
    candidates: candidates.length,
    units: units.length,
    retried,
    succeeded: totalSucceeded,
    durationMs: Date.now() - startedAt,
  })
}

export async function GET(req: Request) {
  return handle(req)
}

export async function POST(req: Request) {
  return handle(req)
}
