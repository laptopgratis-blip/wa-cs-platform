// POST /api/live/[slug]/event — terima event dari client (PRODUCT_CLICK).
// Untuk MVP, cuma whitelist PRODUCT_CLICK supaya gak abuse. Event lain
// (USER_MESSAGE, AI_MESSAGE) dicatat di chat handler — sumber kebenaran
// server-side, bukan client.
import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { bumpProductClicks, logLiveEvent } from '@/lib/services/live/tangkap'

const schema = z.object({
  clientSessionId: z.string().trim().min(8).max(64),
  type: z.literal('PRODUCT_CLICK'),
  productId: z.string().trim().min(1),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid', 400)
  }
  const { clientSessionId, productId } = parsed.data

  const room = await prisma.liveRoom.findUnique({
    where: { slug },
    select: { id: true },
  })
  if (!room) return jsonError('Room tidak ditemukan', 404)

  const session = await prisma.liveSession.findUnique({
    where: { clientSessionId },
    select: { id: true, liveRoomId: true },
  })
  if (!session || session.liveRoomId !== room.id) {
    return jsonError('Session tidak valid', 400)
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { name: true },
  })

  await logLiveEvent({
    liveSessionId: session.id,
    type: 'PRODUCT_CLICK',
    payload: { productId, productName: product?.name ?? null },
  })
  await bumpProductClicks(session.id)

  return jsonOk({ logged: true })
}
