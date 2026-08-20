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
      await prisma.followUpQueue.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'SKIPPED', failedReason: 'Customer in blacklist' },
      })
      return jsonError('Customer ada di blacklist', 400)
    }

    // Claim atomik SEBELUM kirim — cron followup-send memproses item due
    // dengan claim yang sama; tanpa ini klik "Kirim sekarang" yang overlap
    // dengan run cron mengirim WA dobel + memotong kredit dobel (wamid beda).
    const claim = await prisma.followUpQueue.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'SENT', sentAt: new Date() },
    })
    if (claim.count === 0) {
      return jsonError('Item sedang/baru saja diproses — muat ulang daftar', 409)
    }

    const send = await sendQueueItem(item, { source: 'MANUAL' })
    if (!send.success) {
      // Lepas claim supaya bisa dikirim ulang (manual atau cron).
      await prisma.followUpQueue.updateMany({
        where: { id, status: 'SENT' },
        data: { status: 'PENDING', sentAt: null, failedReason: send.error ?? 'Gagal kirim' },
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
          status: 'FAILED',
          errorMessage: send.error,
          source: 'MANUAL',
        },
      })
      return jsonError(`Gagal kirim: ${send.error}`, 500)
    }

    // Status & sentAt sudah di-set saat claim di atas.
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
