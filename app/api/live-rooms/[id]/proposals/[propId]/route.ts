// PATCH /api/live-rooms/[id]/proposals/[propId] — owner decision.
// Body: { action: 'approve' | 'reject' | 'rollback', note?: string }
// approve → save snapshot LiveRoom field, apply proposalText, set APPLIED.
// reject → set REJECTED.
// rollback → restore from beforeSnapshot, set ROLLED_BACK.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

const patchSchema = z.object({
  action: z.enum(['approve', 'reject', 'rollback']),
  note: z.string().trim().max(500).optional(),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; propId: string }> },
) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id, propId } = await params
  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid', 400)
  }
  const { action, note } = parsed.data

  const prop = await prisma.liveOptimizationProposal.findUnique({
    where: { id: propId },
    select: {
      id: true,
      userId: true,
      liveRoomId: true,
      status: true,
      targetAsset: true,
      proposalText: true,
      beforeSnapshot: true,
    },
  })
  if (!prop) return jsonError('Proposal tidak ditemukan', 404)
  if (prop.userId !== session.user.id) return jsonError('Akses ditolak', 403)
  if (prop.liveRoomId !== id) return jsonError('Proposal milik room lain', 400)

  const now = new Date()

  if (action === 'reject') {
    if (prop.status !== 'PENDING') {
      return jsonError('Cuma proposal PENDING yang bisa di-reject', 400)
    }
    const updated = await prisma.liveOptimizationProposal.update({
      where: { id: propId },
      data: { status: 'REJECTED', decidedAt: now, decidedNote: note ?? null },
    })
    return jsonOk(updated)
  }

  if (action === 'approve') {
    if (prop.status !== 'PENDING') {
      return jsonError('Cuma proposal PENDING yang bisa di-approve', 400)
    }

    // Snapshot before + apply ke field LiveRoom (kecuali REBUTTAL_NOTE — itu
    // free-form catatan, gak modify schema).
    const room = await prisma.liveRoom.findUnique({
      where: { id },
      select: { systemPrompt: true, greeting: true },
    })
    if (!room) return jsonError('Room tidak ditemukan', 404)

    let snapshot: string | null = null
    if (prop.targetAsset === 'SYSTEM_PROMPT') {
      snapshot = room.systemPrompt
      await prisma.liveRoom.update({
        where: { id },
        data: { systemPrompt: prop.proposalText },
      })
    } else if (prop.targetAsset === 'GREETING') {
      snapshot = room.greeting
      await prisma.liveRoom.update({
        where: { id },
        data: { greeting: prop.proposalText },
      })
    }
    // REBUTTAL_NOTE: no auto-apply ke LiveRoom. Cuma mark APPLIED.

    const updated = await prisma.liveOptimizationProposal.update({
      where: { id: propId },
      data: {
        status: 'APPLIED',
        decidedAt: now,
        appliedAt: now,
        beforeSnapshot: snapshot,
        decidedNote: note ?? null,
      },
    })
    return jsonOk(updated)
  }

  // rollback
  if (prop.status !== 'APPLIED') {
    return jsonError('Cuma proposal APPLIED yang bisa di-rollback', 400)
  }
  if (prop.targetAsset === 'REBUTTAL_NOTE') {
    return jsonError('REBUTTAL_NOTE tidak punya state — tidak perlu rollback', 400)
  }
  if (prop.beforeSnapshot === null) {
    return jsonError('beforeSnapshot kosong — gak bisa rollback', 400)
  }
  if (prop.targetAsset === 'SYSTEM_PROMPT') {
    await prisma.liveRoom.update({
      where: { id },
      data: { systemPrompt: prop.beforeSnapshot },
    })
  } else if (prop.targetAsset === 'GREETING') {
    await prisma.liveRoom.update({
      where: { id },
      data: { greeting: prop.beforeSnapshot },
    })
  }
  const updated = await prisma.liveOptimizationProposal.update({
    where: { id: propId },
    data: { status: 'ROLLED_BACK', decidedNote: note ?? null },
  })
  return jsonOk(updated)
}
