// GET /api/live-rooms/[id]/leads — list lead masuk untuk room ini (owner).
// Termasuk session stats (msg count, product clicks, durasi).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

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

  const [leads, sessionsStats] = await Promise.all([
    prisma.liveLead.findMany({
      where: { liveRoomId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        customerName: true,
        customerPhone: true,
        productInterest: true,
        status: true,
        contactId: true,
        handoffError: true,
        createdAt: true,
        liveSession: {
          select: {
            messageCount: true,
            productClicks: true,
            startedAt: true,
          },
        },
      },
    }),
    // Sessions tanpa lead — drop-off candidates.
    prisma.liveSession.aggregate({
      where: { liveRoomId: id },
      _count: { id: true },
    }),
  ])

  const leadsCount = leads.length
  const sessionsCount = sessionsStats._count.id
  const conversionRate =
    sessionsCount > 0 ? (leadsCount / sessionsCount) * 100 : 0

  return jsonOk({
    room: { id: room.id, name: room.name, slug: room.slug },
    stats: {
      totalSessions: sessionsCount,
      totalLeads: leadsCount,
      conversionRate: Math.round(conversionRate * 10) / 10,
    },
    leads: leads.map((l) => ({
      id: l.id,
      customerName: l.customerName,
      customerPhone: l.customerPhone,
      productInterest: l.productInterest,
      status: l.status,
      contactId: l.contactId,
      handoffError: l.handoffError,
      createdAt: l.createdAt,
      messageCount: l.liveSession.messageCount,
      productClicks: l.liveSession.productClicks,
      sessionStartedAt: l.liveSession.startedAt,
    })),
  })
}
