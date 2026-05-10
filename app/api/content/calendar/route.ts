// GET /api/content/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
// Return ContentPiece dgn scheduledFor di range. Untuk render calendar grid.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const url = new URL(req.url)
  const fromStr = url.searchParams.get('from')
  const toStr = url.searchParams.get('to')
  if (!fromStr || !toStr) return jsonError('from & to wajib (YYYY-MM-DD)')
  const from = new Date(fromStr)
  const to = new Date(toStr)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return jsonError('Tanggal tidak valid')
  }
  // Inclusive end-of-day untuk to.
  to.setHours(23, 59, 59, 999)

  const pieces = await prisma.contentPiece.findMany({
    where: {
      userId: session.user.id,
      scheduledFor: { gte: from, lte: to },
    },
    select: {
      id: true,
      title: true,
      channel: true,
      funnelStage: true,
      status: true,
      scheduledFor: true,
    },
    orderBy: { scheduledFor: 'asc' },
  })
  return jsonOk({ pieces })
}
