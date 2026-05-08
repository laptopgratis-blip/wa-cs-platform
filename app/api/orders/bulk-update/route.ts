// POST /api/orders/bulk-update
// Body: { orderIds: string[] (max 100), action, cancelledReason?, trackingNumber? }
// Action:
//   mark_paid       → paymentStatus = PAID + paidAt + trigger PAYMENT_PAID followup
//   mark_shipped    → deliveryStatus = SHIPPED + shippedAt + trigger SHIPPED followup
//   mark_delivered  → deliveryStatus = DELIVERED + deliveredAt + trigger COMPLETED followup
//   reject          → paymentStatus = CANCELLED + deliveryStatus = CANCELLED + cancel queue + trigger CANCELLED
//
// Idempotent — kalau status sudah sesuai, skip silently. Hanya update yang
// transition baru. Per-order processing supaya error 1 tidak cancel semua.
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import {
  cancelQueueForOrder,
  generateQueueForOrder,
  type FollowupEvent,
} from '@/lib/services/followup-engine'
import { firePixelEventForOrder } from '@/lib/services/pixel-fire'
import { prisma } from '@/lib/prisma'

const bulkSchema = z.object({
  orderIds: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(['mark_paid', 'mark_shipped', 'mark_delivered', 'reject']),
  cancelledReason: z.string().trim().max(500).optional(),
})

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as Response
  }

  const body = await req.json().catch(() => null)
  const parsed = bulkSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Invalid input', 400)
  }
  const { orderIds, action, cancelledReason } = parsed.data

  // Ambil hanya order yang owner-nya user ini — security per-order check.
  const orders = await prisma.userOrder.findMany({
    where: { id: { in: orderIds }, userId: session.user.id },
    select: {
      id: true,
      paymentStatus: true,
      deliveryStatus: true,
      invoiceNumber: true,
      orderFormId: true,
    },
  })

  let updated = 0
  let skipped = 0
  let failed = 0
  const errors: { id: string; error: string }[] = []

  for (const order of orders) {
    try {
      const followupEvents: FollowupEvent[] = []
      let didUpdate = false
      const data: Parameters<typeof prisma.userOrder.update>[0]['data'] = {}

      if (action === 'mark_paid') {
        if (order.paymentStatus === 'PAID') {
          skipped++
          continue
        }
        data.paymentStatus = 'PAID'
        data.paidAt = new Date()
        followupEvents.push('PAYMENT_PAID')
        didUpdate = true
      } else if (action === 'mark_shipped') {
        if (order.deliveryStatus === 'SHIPPED') {
          skipped++
          continue
        }
        data.deliveryStatus = 'SHIPPED'
        data.shippedAt = new Date()
        followupEvents.push('SHIPPED')
        didUpdate = true
      } else if (action === 'mark_delivered') {
        if (order.deliveryStatus === 'DELIVERED') {
          skipped++
          continue
        }
        data.deliveryStatus = 'DELIVERED'
        data.deliveredAt = new Date()
        followupEvents.push('COMPLETED')
        didUpdate = true
      } else if (action === 'reject') {
        if (
          order.paymentStatus === 'CANCELLED' &&
          order.deliveryStatus === 'CANCELLED'
        ) {
          skipped++
          continue
        }
        data.paymentStatus = 'CANCELLED'
        data.deliveryStatus = 'CANCELLED'
        data.cancelledAt = new Date()
        if (cancelledReason) data.cancelledReason = cancelledReason
        followupEvents.push('CANCELLED')
        didUpdate = true
      }

      if (!didUpdate) {
        skipped++
        continue
      }

      await prisma.userOrder.update({ where: { id: order.id }, data })
      updated++

      // Pixel fire saat transisi PAID — sama logic seperti PATCH endpoint.
      if (
        action === 'mark_paid' &&
        order.invoiceNumber &&
        order.orderFormId
      ) {
        firePixelEventForOrder({
          orderId: order.id,
          eventName: 'Purchase',
        }).catch(() => {})
      }

      // Kalau reject, cancel pending queue dulu sebelum generate event CANCELLED.
      if (action === 'reject') {
        cancelQueueForOrder(order.id, cancelledReason ?? 'Bulk reject').catch(
          (err) => console.error('[bulk-update] cancelQueue:', err),
        )
      }

      for (const event of followupEvents) {
        generateQueueForOrder(order.id, event).catch((err) =>
          console.error(`[bulk-update] followup ${event}:`, err),
        )
      }
    } catch (err) {
      failed++
      errors.push({
        id: order.id,
        error: err instanceof Error ? err.message : 'Unknown',
      })
    }
  }

  return jsonOk({
    requested: orderIds.length,
    matched: orders.length,
    updated,
    skipped,
    failed,
    errors,
  })
}
