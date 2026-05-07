// POST /api/notifications/[id]/read — mark single notification sebagai dibaca.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  try {
    const result = await prisma.subscriptionNotification.updateMany({
      where: { id, userId: session.user.id, readAt: null },
      data: { readAt: new Date() },
    })
    return jsonOk({ updated: result.count })
  } catch (err) {
    console.error('[POST /api/notifications/:id/read] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
