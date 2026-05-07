// GET /api/notifications — list user's subscription notifications (10 terbaru).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  try {
    const [items, unreadCount] = await Promise.all([
      prisma.subscriptionNotification.findMany({
        where: {
          userId: session.user.id,
          channel: 'IN_APP',
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.subscriptionNotification.count({
        where: {
          userId: session.user.id,
          channel: 'IN_APP',
          readAt: null,
        },
      }),
    ])

    return jsonOk({
      unreadCount,
      notifications: items.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        link: n.link,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    console.error('[GET /api/notifications] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
