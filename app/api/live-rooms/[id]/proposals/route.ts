// GET  /api/live-rooms/[id]/proposals — list proposals utk room (semua status).
// POST /api/live-rooms/[id]/proposals — owner trigger generate baru.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { InsufficientBalanceError } from '@/lib/services/ai-generation-log'
import { generateProposalsForRoom } from '@/lib/services/live/optimization-proposer'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  const room = await prisma.liveRoom.findUnique({
    where: { id },
    select: { id: true, userId: true, name: true, systemPrompt: true, greeting: true },
  })
  if (!room) return jsonError('Room tidak ditemukan', 404)
  if (room.userId !== session.user.id) return jsonError('Akses ditolak', 403)

  const proposals = await prisma.liveOptimizationProposal.findMany({
    where: { liveRoomId: id },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 50,
  })
  return jsonOk({
    room: {
      id: room.id,
      name: room.name,
      systemPrompt: room.systemPrompt,
      greeting: room.greeting,
    },
    proposals,
  })
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  const room = await prisma.liveRoom.findUnique({
    where: { id },
    select: { userId: true },
  })
  if (!room) return jsonError('Room tidak ditemukan', 404)
  if (room.userId !== session.user.id) return jsonError('Akses ditolak', 403)

  try {
    const result = await generateProposalsForRoom({ liveRoomId: id })
    return jsonOk(result)
  } catch (err) {
    if (err instanceof InsufficientBalanceError) {
      return jsonError(
        `Saldo token kurang. Butuh ±${err.tokensRequired} token.`,
        402,
      )
    }
    return jsonError(
      `Gagal generate proposals: ${(err as Error).message.slice(0, 300)}`,
      500,
    )
  }
}
