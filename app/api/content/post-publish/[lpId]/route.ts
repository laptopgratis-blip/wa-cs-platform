// GET /api/content/post-publish/[lpId]
// Return state post-publish 15-status untuk LP user — list pieces yang sudah
// generated (0/3/15 tergantung tahap).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { getPostPublishState } from '@/lib/services/post-publish-content'

export async function GET(
  _req: Request,
  context: { params: Promise<{ lpId: string }> },
) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { lpId } = await context.params

  // Validasi LP milik user.
  const lp = await prisma.landingPage.findFirst({
    where: { id: lpId, userId: session.user.id },
    select: { id: true, title: true, slug: true, isPublished: true },
  })
  if (!lp) return jsonError('LP tidak ditemukan', 404)

  // Saldo user — dipakai UI untuk decide apakah show "top-up" atau "unlock".
  const balance = await prisma.tokenBalance.findUnique({
    where: { userId: session.user.id },
    select: { balance: true },
  })

  const state = await getPostPublishState({
    userId: session.user.id,
    lpId,
  })

  return jsonOk({
    lp,
    state,
    balance: balance?.balance ?? 0,
  })
}
