// PATCH /api/live-rooms/[id]/leads/[leadId] — owner mark outcome:
// body { status: 'CLOSED_WON' | 'CLOSED_LOST' } — juga update LiveSession.outcome.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  status: z.enum(['CLOSED_WON', 'CLOSED_LOST']),
  note: z.string().trim().max(500).optional(),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; leadId: string }> },
) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id, leadId } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid', 400)
  }

  const lead = await prisma.liveLead.findUnique({
    where: { id: leadId },
    select: { userId: true, liveRoomId: true, liveSessionId: true },
  })
  if (!lead) return jsonError('Lead tidak ditemukan', 404)
  if (lead.userId !== session.user.id) return jsonError('Akses ditolak', 403)
  if (lead.liveRoomId !== id) return jsonError('Lead milik room lain', 400)

  await prisma.$transaction([
    prisma.liveLead.update({
      where: { id: leadId },
      data: { status: parsed.data.status },
    }),
    prisma.liveSession.update({
      where: { id: lead.liveSessionId },
      data: {
        outcome: parsed.data.status,
        outcomeReason: parsed.data.note ?? null,
      },
    }),
  ])
  return jsonOk({ leadId, status: parsed.data.status })
}
