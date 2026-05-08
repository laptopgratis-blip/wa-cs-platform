// Follow-Up Order System engine — generate FollowUpQueue items saat event order
// terjadi, dan cancel queue saat order ditutup. Dipanggil dari endpoint:
//   - app/api/orders/submit (ORDER_CREATED)
//   - app/api/orders/[id] PATCH (PAYMENT_PAID, SHIPPED, COMPLETED, CANCELLED)
//   - app/api/internal/order-auto-paid (PAYMENT_PAID)
//
// Plan gating, WA gating, blacklist, dan dedup ditangani di sini supaya caller
// cukup `await generateQueueForOrder(orderId, event)` tanpa perlu paham detail.

import { prisma } from '@/lib/prisma'
import { checkOrderSystemAccess } from '@/lib/order-system-gate'

import { resolveTemplateVariables } from './followup-variables'

export type FollowupEvent =
  | 'ORDER_CREATED'
  | 'PAYMENT_PAID'
  | 'SHIPPED'
  | 'COMPLETED'
  | 'CANCELLED'

const MAX_DELAY_DAYS = 30

// Map event → trigger types yang harus dicari di FollowUpTemplate.
// DAYS_AFTER_* di-trigger sekaligus karena base event-nya sama, hanya delay
// yang beda. Misal saat ORDER_CREATED kita generate juga template
// DAYS_AFTER_ORDER (delay 1, 2, dst) dengan scheduledAt = now + delayDays.
function mapEventToTriggers(event: FollowupEvent): string[] {
  switch (event) {
    case 'ORDER_CREATED':
      return ['ORDER_CREATED', 'DAYS_AFTER_ORDER']
    case 'PAYMENT_PAID':
      return ['PAYMENT_PAID', 'DAYS_AFTER_PAID']
    case 'SHIPPED':
      return ['SHIPPED', 'DAYS_AFTER_SHIPPED']
    case 'COMPLETED':
      return ['COMPLETED']
    case 'CANCELLED':
      return ['CANCELLED']
    default:
      return []
  }
}

export async function generateQueueForOrder(
  orderId: string,
  event: FollowupEvent,
): Promise<{ generated: number; reason?: string }> {
  const order = await prisma.userOrder.findUnique({
    where: { id: orderId },
    include: { user: { select: { id: true, name: true } } },
  })
  if (!order) return { generated: 0, reason: 'Order not found' }

  const access = await checkOrderSystemAccess(order.userId)
  if (!access.hasAccess) {
    return { generated: 0, reason: 'Plan gating: not POWER' }
  }

  const waSession = await prisma.whatsappSession.findFirst({
    where: { userId: order.userId, status: 'CONNECTED' },
    select: { id: true },
  })
  if (!waSession) {
    return { generated: 0, reason: 'No active WA session' }
  }

  // Customer di blacklist → skip semua queue untuk customer ini.
  const blacklisted = await prisma.followUpBlacklist.findUnique({
    where: {
      userId_customerPhone: {
        userId: order.userId,
        customerPhone: order.customerPhone,
      },
    },
  })
  if (blacklisted) return { generated: 0, reason: 'Customer in blacklist' }

  const eventTriggers = mapEventToTriggers(event)
  if (eventTriggers.length === 0) return { generated: 0 }

  const templates = await prisma.followUpTemplate.findMany({
    where: {
      userId: order.userId,
      isActive: true,
      trigger: { in: eventTriggers },
      OR: [
        { scope: 'GLOBAL' },
        { scope: 'FORM', orderFormId: order.orderFormId },
      ],
    },
  })

  // Filter sesuai paymentMethod & status. Filter di Node biar query
  // sederhana — jumlah template per user kecil (puluhan).
  const matched = templates.filter((t) => {
    if (t.paymentMethod && t.paymentMethod !== order.paymentMethod) return false
    if (
      t.applyOnPaymentStatus &&
      t.applyOnPaymentStatus !== order.paymentStatus
    ) {
      return false
    }
    if (
      t.applyOnDeliveryStatus &&
      t.applyOnDeliveryStatus !== order.deliveryStatus
    ) {
      return false
    }
    if (t.delayDays < 0 || t.delayDays > MAX_DELAY_DAYS) return false
    return true
  })

  if (matched.length === 0) return { generated: 0 }

  const [bankAccounts, shippingProfile] = await Promise.all([
    prisma.userBankAccount.findMany({
      where: { userId: order.userId, isActive: true },
    }),
    prisma.userShippingProfile.findUnique({
      where: { userId: order.userId },
    }),
  ])

  let generated = 0
  for (const template of matched) {
    // Dedup per (order, template, status != CANCELLED). Tujuan: kalau event
    // sama trigger ulang (mis. PATCH update status berkali-kali), tidak
    // duplikat queue.
    const existing = await prisma.followUpQueue.findFirst({
      where: {
        orderId,
        templateId: template.id,
        status: { not: 'CANCELLED' },
      },
    })
    if (existing) continue

    const scheduledAt = new Date()
    scheduledAt.setMinutes(scheduledAt.getMinutes() + 0)
    scheduledAt.setDate(scheduledAt.getDate() + template.delayDays)

    const resolvedMessage = resolveTemplateVariables(template.message, {
      order,
      user: order.user,
      bankAccounts,
      shippingProfile,
    })

    await prisma.followUpQueue.create({
      data: {
        userId: order.userId,
        orderId,
        templateId: template.id,
        scheduledAt,
        resolvedMessage,
        customerPhone: order.customerPhone,
        triggerEvent: event,
      },
    })
    generated++
  }

  return { generated }
}

// Cancel semua queue PENDING untuk order — dipanggil saat order CANCELLED
// (sebelum generate event CANCELLED supaya template "Order Dibatalkan" tetap
// ke-generate kalau ada).
export async function cancelQueueForOrder(orderId: string, reason?: string) {
  const result = await prisma.followUpQueue.updateMany({
    where: { orderId, status: 'PENDING' },
    data: {
      status: 'CANCELLED',
      failedReason: reason ?? 'Order cancelled',
    },
  })
  return { cancelled: result.count }
}

// Cancel semua queue PENDING untuk customer phone (per-user) — dipanggil saat
// customer kirim STOP via WA (lewat /api/internal/followup-stop-check).
export async function cancelQueueForCustomer(
  userId: string,
  customerPhone: string,
  reason?: string,
) {
  const result = await prisma.followUpQueue.updateMany({
    where: { userId, customerPhone, status: 'PENDING' },
    data: {
      status: 'CANCELLED',
      failedReason: reason ?? 'Customer requested stop',
    },
  })
  return { cancelled: result.count }
}
