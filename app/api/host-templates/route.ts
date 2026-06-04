// GET /api/host-templates — list host yang available untuk user di form
// Live Room. Termasuk: (a) milik user sendiri, (b) public (admin library).
// Hanya status=READY (videoLoopUrl ada) — yang siap dipakai.
import type { NextResponse } from 'next/server'

import { jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const rows = await prisma.hostTemplate.findMany({
    where: {
      status: 'READY',
      videoLoopUrl: { not: null },
      OR: [{ userId: session.user.id }, { isPublic: true }],
    },
    orderBy: [{ isPublic: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      name: true,
      visualStyle: true,
      videoLoopUrl: true,
      sourceImageUrl: true,
      isPublic: true,
      userId: true,
      videoSeconds: true,
    },
  })
  // Tandai mana milik sendiri vs library.
  const data = rows.map((r) => ({
    ...r,
    isOwn: r.userId === session.user.id,
  }))
  return jsonOk(data)
}
