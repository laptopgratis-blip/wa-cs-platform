// GET /api/admin/alerts — list 50 alert terbaru + count unread.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const [items, unread] = await Promise.all([
      prisma.alert.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.alert.count({ where: { isRead: false } }),
    ])
    return jsonOk({
      unread,
      items: items.map((a) => ({
        id: a.id,
        level: a.level,
        category: a.category,
        title: a.title,
        message: a.message,
        isRead: a.isRead,
        createdAt: a.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    console.error('[GET /api/admin/alerts] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
