// POST or GET /api/cron/followup-send
//
// Worker untuk Follow-Up Order System — pick FollowUpQueue PENDING yang due
// (scheduledAt <= now), validate ulang kondisi, kirim ke customer via WA, log.
//
// Setup eksternal: cron-job.org, hit:
//   https://hulao.id/api/cron/followup-send?secret=<CRON_SECRET>
// Frequency: tiap 5 menit. Batch 50 per run untuk avoid spam burst.
//
// Auth: header `x-cron-secret` atau query `?secret=` == CRON_SECRET.
import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { waService } from '@/lib/wa-service'

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const url = new URL(req.url)
  const queryToken = url.searchParams.get('secret')
  const headerToken = req.headers.get('x-cron-secret')
  return queryToken === expected || headerToken === expected
}

const BATCH_SIZE = 50
const MAX_SEND_RETRY = 3 // failure transmisi WA
const MAX_WA_RETRY = 5 // WA session tidak CONNECTED (delay 30 menit per retry)
const RETRY_BACKOFF_MS = 15 * 60 * 1000
const WA_RECONNECT_BACKOFF_MS = 30 * 60 * 1000

async function handle(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { success: false, error: 'unauthorized' },
      { status: 401 },
    )
  }

  const now = new Date()

  const due = await prisma.followUpQueue.findMany({
    where: { status: 'PENDING', scheduledAt: { lte: now } },
    include: { order: true, template: true },
    take: BATCH_SIZE,
    orderBy: { scheduledAt: 'asc' },
  })

  let sent = 0
  let failed = 0
  let skipped = 0
  let retried = 0

  for (const item of due) {
    try {
      // Order CANCELLED → skip (kecuali template-nya emang untuk CANCELLED).
      if (
        item.order.paymentStatus === 'CANCELLED' &&
        item.template.trigger !== 'CANCELLED'
      ) {
        await markSkipped(item.id, 'Order cancelled')
        skipped++
        continue
      }

      // Re-validate status — mungkin status berubah sejak queue di-create.
      // Misal template "Reminder Hari 1 - Belum Bayar" applyOnPaymentStatus=
      // PENDING; kalau saat send sudah PAID, skip.
      if (
        item.template.applyOnPaymentStatus &&
        item.template.applyOnPaymentStatus !== item.order.paymentStatus
      ) {
        await markSkipped(
          item.id,
          `Payment status berubah jadi ${item.order.paymentStatus}`,
        )
        skipped++
        continue
      }
      if (
        item.template.applyOnDeliveryStatus &&
        item.template.applyOnDeliveryStatus !== item.order.deliveryStatus
      ) {
        await markSkipped(
          item.id,
          `Delivery status berubah jadi ${item.order.deliveryStatus}`,
        )
        skipped++
        continue
      }

      // Customer di blacklist (mungkin baru di-block setelah queue dibuat).
      const blacklisted = await prisma.followUpBlacklist.findUnique({
        where: {
          userId_customerPhone: {
            userId: item.userId,
            customerPhone: item.customerPhone,
          },
        },
      })
      if (blacklisted) {
        await markSkipped(item.id, 'Customer in blacklist')
        skipped++
        continue
      }

      // Cek WA session — kalau disconnected, retry ulang nanti (jangan langsung
      // FAILED, mungkin user lagi reconnect).
      const session = await prisma.whatsappSession.findFirst({
        where: { userId: item.userId, status: 'CONNECTED' },
        select: { id: true },
      })
      if (!session) {
        if (item.retryCount >= MAX_WA_RETRY) {
          await markFailed(
            item.id,
            `WA session not connected after ${MAX_WA_RETRY} retries`,
          )
          failed++
        } else {
          await prisma.followUpQueue.update({
            where: { id: item.id },
            data: {
              retryCount: { increment: 1 },
              scheduledAt: new Date(Date.now() + WA_RECONNECT_BACKOFF_MS),
              failedReason: 'WA session disconnected — retry later',
            },
          })
          retried++
        }
        continue
      }

      // Kirim via WA service.
      const sendResult = await waService
        .sendMessage(session.id, item.customerPhone, item.resolvedMessage)
        .then((data) => ({ ok: true as const, data }))
        .catch((err: unknown) => ({
          ok: false as const,
          error: err instanceof Error ? err.message : String(err),
        }))

      if (sendResult.ok) {
        await prisma.followUpQueue.update({
          where: { id: item.id },
          data: { status: 'SENT', sentAt: new Date() },
        })
        await prisma.followUpLog.create({
          data: {
            userId: item.userId,
            orderId: item.orderId,
            templateId: item.templateId,
            queueId: item.id,
            customerPhone: item.customerPhone,
            message: item.resolvedMessage,
            status: 'SENT',
            source: 'AUTOMATIC',
          },
        })
        sent++
      } else {
        if (item.retryCount >= MAX_SEND_RETRY) {
          await markFailed(item.id, sendResult.error || 'Send failed')
          await prisma.followUpLog.create({
            data: {
              userId: item.userId,
              orderId: item.orderId,
              templateId: item.templateId,
              queueId: item.id,
              customerPhone: item.customerPhone,
              message: item.resolvedMessage,
              status: 'FAILED',
              errorMessage: sendResult.error || 'Send failed',
              source: 'AUTOMATIC',
            },
          })
          failed++
        } else {
          await prisma.followUpQueue.update({
            where: { id: item.id },
            data: {
              retryCount: { increment: 1 },
              scheduledAt: new Date(Date.now() + RETRY_BACKOFF_MS),
              failedReason: sendResult.error,
            },
          })
          retried++
        }
      }
    } catch (err) {
      console.error('[followup-send] item error:', item.id, err)
      failed++
    }
  }

  return NextResponse.json({
    success: true,
    data: { total: due.length, sent, failed, skipped, retried },
  })
}

async function markSkipped(queueId: string, reason: string) {
  await prisma.followUpQueue.update({
    where: { id: queueId },
    data: { status: 'SKIPPED', failedReason: reason },
  })
}

async function markFailed(queueId: string, reason: string) {
  await prisma.followUpQueue.update({
    where: { id: queueId },
    data: { status: 'FAILED', failedReason: reason },
  })
}

export async function GET(req: Request) {
  return handle(req)
}
export async function POST(req: Request) {
  return handle(req)
}
