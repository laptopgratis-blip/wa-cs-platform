// POST /api/notifications/read-all — mark semua user notifikasi sebagai dibaca.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export async function POST() {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const result = await prisma.subscriptionNotification.updateMany({
      where: { userId: session.user.id, readAt: null },
      data: { readAt: new Date() },
    })
    return jsonOk({ updated: result.count })
  } catch (err) {
    console.error('[POST /api/notifications/read-all] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
