// POST /api/broadcast/[broadcastId]/send
// Trigger eksekusi broadcast — wa-service yang loop kirim dengan delay random.
import type { NextResponse } from 'next/server'

import type { PipelineStage } from '@prisma/client'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { buildTargetWhere, renderBroadcastMessage } from '@/lib/broadcast'
import { prisma } from '@/lib/prisma'
import { waService } from '@/lib/wa-service'

interface Params {
  params: Promise<{ broadcastId: string }>
}

export async function POST(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { broadcastId } = await params

  try {
    const broadcast = await prisma.broadcast.findFirst({
      where: { id: broadcastId, userId: session.user.id },
    })
    if (!broadcast) return jsonError('Broadcast tidak ditemukan', 404)
    if (broadcast.status !== 'DRAFT' && broadcast.status !== 'SCHEDULED') {
      return jsonError(
        `Broadcast tidak bisa dijalankan dari status ${broadcast.status}`,
      )
    }

    // Bangun list target sebenarnya saat ini (mungkin berubah sejak create).
    const contacts = await prisma.contact.findMany({
      where: buildTargetWhere({
        userId: session.user.id,
        waSessionId: broadcast.waSessionId,
        tags: broadcast.targetTags,
        stages: broadcast.targetStages as PipelineStage[],
      }) as never,
      select: { id: true, phoneNumber: true, name: true },
    })

    if (contacts.length === 0) {
      await prisma.broadcast.update({
        where: { id: broadcastId },
        data: {
          status: 'COMPLETED',
          totalTargets: 0,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      })
      return jsonError('Tidak ada kontak yang cocok dengan filter', 400)
    }

    const items = contacts.map((c) => ({
      phoneNumber: c.phoneNumber,
      content: renderBroadcastMessage(broadcast.message, {
        name: c.name,
        phoneNumber: c.phoneNumber,
      }),
    }))

    // Tandai SENDING dulu, baru trigger wa-service. Kalau wa-service nolak,
    // rollback ke status semula.
    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: {
        status: 'SENDING',
        totalTargets: items.length,
        totalSent: 0,
        totalFailed: 0,
        startedAt: new Date(),
      },
    })

    const result = await waService.startBroadcast({
      sessionId: broadcast.waSessionId,
      broadcastId,
      items,
    })

    if (!result.success) {
      // Rollback ke FAILED supaya user tahu.
      await prisma.broadcast.update({
        where: { id: broadcastId },
        data: { status: 'FAILED' },
      })
      return jsonError(result.error || 'wa-service gagal merespons', 502)
    }

    return jsonOk({ id: broadcastId, status: 'SENDING', totalTargets: items.length })
  } catch (err) {
    console.error('[POST /api/broadcast/:id/send] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
