// GET  /api/live-rooms/[id]/objections — aggregate objection per kategori
//   untuk dashboard map. Plus list session examples.
// POST /api/live-rooms/[id]/objections — owner trigger manual analyze
//   semua session belum dianalisa di room ini.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { batchAnalyzePendingSessions } from '@/lib/services/live/objection-analyzer'

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
    select: { id: true, userId: true, name: true, slug: true },
  })
  if (!room) return jsonError('Room tidak ditemukan', 404)
  if (room.userId !== session.user.id) return jsonError('Akses ditolak', 403)

  // Aggregate per kategori — count + avg confidence.
  const agg = await prisma.liveObjection.groupBy({
    by: ['category'],
    where: { liveSession: { liveRoomId: id } },
    _count: { id: true },
    _avg: { confidence: true },
  })

  // Ambil contoh evidence terbaru per kategori (3 per cat).
  const examples = await prisma.liveObjection.findMany({
    where: { liveSession: { liveRoomId: id } },
    orderBy: { createdAt: 'desc' },
    take: 60,
    select: {
      id: true,
      category: true,
      confidence: true,
      evidence: true,
      aiNotes: true,
      createdAt: true,
      liveSession: {
        select: {
          id: true,
          customerName: true,
          outcome: true,
        },
      },
    },
  })

  // Counts unanalyzed (cron pending) — info untuk owner.
  const unanalyzed = await prisma.liveSession.count({
    where: {
      liveRoomId: id,
      objectionsAnalyzedAt: null,
      messageCount: { gte: 2 },
    },
  })

  return jsonOk({
    room: { id: room.id, name: room.name, slug: room.slug },
    categories: agg.map((a) => ({
      category: a.category,
      count: a._count.id,
      avgConfidence: Math.round((a._avg.confidence ?? 0) * 100) / 100,
    })),
    examples,
    unanalyzedSessions: unanalyzed,
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

  // Limit per call supaya tidak boros saldo.
  const result = await batchAnalyzePendingSessions({ limit: 10 })
  return jsonOk(result)
}
