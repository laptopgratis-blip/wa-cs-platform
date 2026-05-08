// POST /api/followup/queue/[id]/send-now
//
// Trigger immediate send untuk queue item PENDING — bypass scheduledAt. Pakai
// resolvedMessage yang udah ada (sudah di-resolve saat queue di-create). Kalau
// user mau edit message dulu, panggil PATCH /api/followup/queue/[id] sebelum.
import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import { waService } from '@/lib/wa-service'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, { params }: Params) {
  try {
    const { session } = await requireOrderSystemAccess()
    const { id } = await params

    const item = await prisma.followUpQueue.findFirst({
      where: { id, userId: session.user.id },
    })
    if (!item) return jsonError('Queue item tidak ditemukan', 404)
    if (item.status !== 'PENDING') {
      return jsonError(`Queue sudah ${item.status}`, 400)
    }

    // Cek blacklist last-minute.
    const blacklisted = await prisma.followUpBlacklist.findUnique({
      where: {
        userId_customerPhone: {
          userId: session.user.id,
          customerPhone: item.customerPhone,
        },
      },
    })
    if (blacklisted) {
      await prisma.followUpQueue.update({
        where: { id },
        data: {
          status: 'SKIPPED',
          failedReason: 'Customer in blacklist',
        },
      })
      return jsonError('Customer ada di blacklist', 400)
    }

    const waSession = await prisma.whatsappSession.findFirst({
      where: { userId: session.user.id, status: 'CONNECTED' },
      select: { id: true },
    })
    if (!waSession) {
      return jsonError('WhatsApp belum tersambung', 400)
    }

    const sendResult = await waService
      .sendMessage(waSession.id, item.customerPhone, item.resolvedMessage)
      .then((data) => ({ ok: true as const, data }))
      .catch((err: unknown) => ({
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
      }))

    if (!sendResult.ok) {
      await prisma.followUpLog.create({
        data: {
          userId: session.user.id,
          orderId: item.orderId,
          templateId: item.templateId,
          queueId: item.id,
          customerPhone: item.customerPhone,
          message: item.resolvedMessage,
          status: 'FAILED',
          errorMessage: sendResult.error,
          source: 'MANUAL',
        },
      })
      return jsonError(`Gagal kirim: ${sendResult.error}`, 500)
    }

    await prisma.followUpQueue.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date() },
    })
    await prisma.followUpLog.create({
      data: {
        userId: session.user.id,
        orderId: item.orderId,
        templateId: item.templateId,
        queueId: item.id,
        customerPhone: item.customerPhone,
        message: item.resolvedMessage,
        status: 'SENT',
        source: 'MANUAL',
      },
    })

    return jsonOk({ sent: true })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[followup/queue send-now]', e)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
