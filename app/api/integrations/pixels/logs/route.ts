// GET /api/integrations/pixels/logs
// Paginated + filter PixelEventLog milik user. Plan-gate POWER.
// Query params: page, limit, platform, eventName, status (succeeded|failed|all),
//               pixelId, from, to.
import type { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }

  const url = new URL(req.url)
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1))
  const limit = Math.min(
    100,
    Math.max(10, Number(url.searchParams.get('limit') ?? 50)),
  )
  const platform = url.searchParams.get('platform')
  const eventName = url.searchParams.get('eventName')
  const status = url.searchParams.get('status')  // 'succeeded' | 'failed' | 'all'
  const pixelId = url.searchParams.get('pixelId')
  const fromRaw = url.searchParams.get('from')
  const toRaw = url.searchParams.get('to')

  const where: Prisma.PixelEventLogWhereInput = { userId: session.user.id }
  if (platform) where.platform = platform
  if (eventName) where.eventName = eventName
  if (status === 'succeeded') where.succeeded = true
  else if (status === 'failed') where.succeeded = false
  if (pixelId) where.pixelId = pixelId

  const dateRange: Prisma.DateTimeFilter = {}
  if (fromRaw) {
    const d = new Date(fromRaw)
    if (!Number.isNaN(d.getTime())) dateRange.gte = d
  }
  if (toRaw) {
    const d = new Date(toRaw)
    if (!Number.isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999)
      dateRange.lte = d
    }
  }
  if (Object.keys(dateRange).length > 0) where.createdAt = dateRange

  try {
    const [items, total] = await Promise.all([
      prisma.pixelEventLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
        select: {
          id: true,
          pixelId: true,
          orderId: true,
          platform: true,
          eventName: true,
          eventId: true,
          source: true,
          payload: true,
          responseStatus: true,
          responseBody: true,
          errorMessage: true,
          retryCount: true,
          succeeded: true,
          createdAt: true,
        },
      }),
      prisma.pixelEventLog.count({ where }),
    ])

    return jsonOk({
      items: items.map((it) => ({
        ...it,
        createdAt: it.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (err) {
    console.error('[GET /api/integrations/pixels/logs] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
