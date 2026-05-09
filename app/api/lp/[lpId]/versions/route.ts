// GET /api/lp/[lpId]/versions
// List versi LP (snapshots dari AI optimization, manual saves, restore actions).
// Sorted desc by createdAt.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ lpId: string }>
}

export async function GET(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { lpId } = await params

  const lp = await prisma.landingPage.findUnique({
    where: { id: lpId },
    select: { userId: true },
  })
  if (!lp) return jsonError('LP tidak ditemukan', 404)
  if (lp.userId !== session.user.id) return jsonError('Forbidden', 403)

  const versions = await prisma.lpVersion.findMany({
    where: { lpId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      source: true,
      scoreSnapshot: true,
      note: true,
      createdAt: true,
      optimizationId: true,
    },
  })

  return jsonOk({
    versions: versions.map((v) => ({
      id: v.id,
      source: v.source,
      scoreSnapshot: v.scoreSnapshot,
      note: v.note,
      createdAt: v.createdAt.toISOString(),
      optimizationId: v.optimizationId,
    })),
  })
}
