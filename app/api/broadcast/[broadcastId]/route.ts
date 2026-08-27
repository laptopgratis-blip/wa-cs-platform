// GET    /api/broadcast/[broadcastId] — detail
// DELETE /api/broadcast/[broadcastId] — cancel (DRAFT/SCHEDULED) atau abort SENDING
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { skipRemaining } from '@/lib/services/broadcast/cloud-runner'
import { waService } from '@/lib/wa-service'

interface Params {
  params: Promise<{ broadcastId: string }>
}

export async function GET(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const { broadcastId } = await params
  try {
    const b = await prisma.broadcast.findFirst({
      where: { id: broadcastId, userId: session.user.id },
      include: {
        waSession: { select: { id: true, displayName: true, phoneNumber: true, provider: true } },
        template: { select: { id: true, name: true, category: true, status: true } },
      },
    })
    if (!b) return jsonError('Broadcast tidak ditemukan', 404)
    return jsonOk({
      ...b,
      scheduledAt: b.scheduledAt?.toISOString() ?? null,
      startedAt: b.startedAt?.toISOString() ?? null,
      completedAt: b.completedAt?.toISOString() ?? null,
      createdAt: b.createdAt.toISOString(),
    })
  } catch (err) {
    console.error('[GET /api/broadcast/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { broadcastId } = await params
  try {
    const b = await prisma.broadcast.findFirst({
      where: { id: broadcastId, userId: session.user.id },
      select: { id: true, status: true, provider: true },
    })
    if (!b) return jsonError('Broadcast tidak ditemukan', 404)

    if (b.status === 'COMPLETED' || b.status === 'CANCELLED') {
      return jsonError('Broadcast sudah selesai dan tidak bisa diubah')
    }

    // Baileys SENDING: minta wa-service abort dulu. Cloud API: pembatalan
    // lewat DB — worker membaca status CANCELLED dan berhenti.
    if (b.status === 'SENDING' && b.provider !== 'CLOUD_API') {
      await waService.cancelBroadcast(broadcastId).catch(() => {})
    }

    const updated = await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { status: 'CANCELLED', completedAt: new Date() },
      select: { id: true, status: true },
    })
    if (b.provider === 'CLOUD_API') await skipRemaining(broadcastId)
    return jsonOk(updated)
  } catch (err) {
    console.error('[DELETE /api/broadcast/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
