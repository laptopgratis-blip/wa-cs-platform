// GET /api/host-templates — list host yang available untuk user di form
// Live Room. Termasuk: (a) milik user sendiri, (b) public (admin library).
// Kesiapan per mode via HOST_USABLE_WHERE: TTS butuh READY+videoLoopUrl;
// Klip Live cukup punya klip READY (statusnya memang berhenti di IMAGE_READY).
import type { NextResponse } from 'next/server'

import { jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { HOST_USABLE_WHERE } from '@/lib/services/host-availability'

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const rows = await prisma.hostTemplate.findMany({
    where: {
      AND: [
        { OR: [{ userId: session.user.id }, { isPublic: true }] },
        HOST_USABLE_WHERE,
      ],
    },
    orderBy: [{ isPublic: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      name: true,
      mode: true,
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
