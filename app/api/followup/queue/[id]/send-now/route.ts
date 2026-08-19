// POST /api/followup/queue/[id]/send-now
// Kirim segera queue item PENDING (bypass scheduledAt) via sendQueueItem
// (provider-aware). Pakai resolvedMessage yang sudah ada.
import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import { sendQueueItem } from '@/lib/services/followup-sender'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, { params }: Params) {
  try {
    const { session } = await requireOrderSystemAccess()
    const { id } = await params

    const item = await prisma.followUpQueue.findFirst({
      where: { id, userId: session.user.id },
      include: { template: true },
    })
    if (!item) return jsonError('Queue item tidak ditemukan', 404)
    if (item.status !== 'PENDING') {
      return jsonError(`Queue sudah ${item.status}`, 400)
    }

    // Cek blacklist last-minute.
    const blacklisted = await prisma.followUpBlacklist.findUnique({
      where: {
        userId_customerPhone: { userId: session.user.id, customerPhone: item.customerPhone },
      },
    })
    if (blacklisted) {
      await prisma.followUpQueue.update({
        where: { id },
        data: { status: 'SKIPPED', failedReason: 'Customer in blacklist' },
      })
      return jsonError('Customer ada di blacklist', 400)
    }

    const send = await sendQueueItem(item, { source: 'MANUAL' })
    if (!send.success) {
      await prisma.followUpLog.create({
        data: {
          userId: session.user.id,
          orderId: item.orderId,
          liveLeadId: item.liveLeadId,
          templateId: item.templateId,
          queueId: item.id,
          customerPhone: item.customerPhone,
          message: item.resolvedMessage,
          status: 'FAILED',
          errorMessage: send.error,
          source: 'MANUAL',
        },
      })
      return jsonError(`Gagal kirim: ${send.error}`, 500)
    }

    await prisma.followUpQueue.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date() },
    })
    await prisma.followUpLog.create({
      data: {
        userId: session.user.id,
        orderId: item.orderId,
        liveLeadId: item.liveLeadId,
        templateId: item.templateId,
        queueId: item.id,
        customerPhone: item.customerPhone,
        message: item.resolvedMessage,
        status: 'SENT',
        source: 'MANUAL',
      },
    })

    return jsonOk({ sent: true, via: send.via })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[followup/queue send-now]', e)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
