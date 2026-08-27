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

import {
  ensureDigitalPaidTemplates,
  ensureLeadNurtureTemplates,
  ensureReviewTemplates,
} from './followup-defaults'
import {
  resolveLeadTemplateParams,
  resolveLeadTemplateVariables,
  resolveTemplateParams,
  resolveTemplateVariables,
} from './followup-variables'

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
      return ['COMPLETED', 'DAYS_AFTER_DELIVERED']
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

  // Saat order diterima, pastikan template testimoni (DAYS_AFTER_DELIVERED)
  // ada untuk user lama (idempotent) supaya panen testimoni jalan otomatis.
  if (event === 'COMPLETED') {
    await ensureReviewTemplates(order.userId)
  }

  // Order digital-only yang PAID: pastikan user punya template varian DIGITAL
  // (idempotent) + retarget template default lama ke PHYSICAL — pembeli
  // e-book jangan dapat pesan "siap dikirim" barang fisik.
  if (event === 'PAYMENT_PAID' && order.isDigitalOnly) {
    await ensureDigitalPaidTemplates(order.userId)
  }

  // Catatan 2026-07-16: dulu ada guard "skip kalau tidak ada WA session
  // CONNECTED" di sini — itu membuat queue TIDAK PERNAH dibuat saat WA owner
  // kebetulan putus sesaat ketika order masuk (konfirmasi customer hilang
  // permanen; kasus prod INV-20260716-HR6W46/LB54Y6). Queue kini selalu
  // dibuat — cron followup-send sudah punya retry "WA disconnected".

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
    // Filter jenis order: DIGITAL hanya utk order digital-only, PHYSICAL
    // hanya utk order yang punya barang fisik. null = semua.
    if (t.orderType === 'DIGITAL' && !order.isDigitalOnly) return false
    if (t.orderType === 'PHYSICAL' && order.isDigitalOnly) return false
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

    const resolveCtx = {
      order,
      user: order.user,
      bankAccounts,
      shippingProfile,
    }
    const resolvedMessage = resolveTemplateVariables(template.message, resolveCtx)
    // Cloud API: kalau template punya metaParamMap, hitung param sekarang.
    const metaParamMap = Array.isArray(template.metaParamMap) ? (template.metaParamMap as string[]) : null
    const resolvedParams =
      template.metaTemplateId && metaParamMap ? resolveTemplateParams(metaParamMap, resolveCtx) : undefined

    await prisma.followUpQueue.create({
      data: {
        userId: order.userId,
        orderId,
        templateId: template.id,
        scheduledAt,
        resolvedMessage,
        ...(resolvedParams ? { resolvedParams } : {}),
        customerPhone: order.customerPhone,
        triggerEvent: event,
      },
    })
    generated++
  }

  return { generated }
}

// ─────────────────────────────────────────────────────────────────────────
// Nurture lead Live "belum order" — generate FollowUpQueue dari LiveLead.
// Dipanggil best-effort saat lead capture (app/api/live/[slug]/lead +
// embed-gate). Trigger DAYS_AFTER_LIVE_LEAD; cron followup-send otomatis SKIP
// item lead begitu customer sudah bikin UserOrder (lihat cron).
// ─────────────────────────────────────────────────────────────────────────
export async function generateQueueForLead(
  liveLeadId: string,
): Promise<{ generated: number; reason?: string }> {
  const lead = await prisma.liveLead.findUnique({
    where: { id: liveLeadId },
    include: {
      user: { select: { id: true, name: true } },
      liveRoom: { select: { slug: true, orderFormSlug: true } },
    },
  })
  if (!lead) return { generated: 0, reason: 'Lead not found' }

  const access = await checkOrderSystemAccess(lead.userId)
  if (!access.hasAccess) return { generated: 0, reason: 'Plan gating: not POWER' }

  // Opt-in: hanya jalan kalau user sudah pakai follow-up (punya minimal 1
  // template). Tidak auto-mengaktifkan untuk user yang belum enable.
  const templateCount = await prisma.followUpTemplate.count({
    where: { userId: lead.userId },
  })
  if (templateCount === 0) return { generated: 0, reason: 'Follow-up not enabled' }

  // Top-up template lead nurture untuk user lama (idempotent).
  await ensureLeadNurtureTemplates(lead.userId)

  // Tanpa guard WA CONNECTED — mirror generateQueueForOrder (2026-07-16):
  // queue selalu dibuat, retry pengiriman urusan cron followup-send.

  // Simpan customerPhone tanpa '+' supaya konsisten dgn UserOrder & WA send.
  const phone = lead.customerPhone.replace(/^\+/, '')

  const blacklisted = await prisma.followUpBlacklist.findUnique({
    where: { userId_customerPhone: { userId: lead.userId, customerPhone: phone } },
  })
  if (blacklisted) return { generated: 0, reason: 'Customer in blacklist' }

  const templates = await prisma.followUpTemplate.findMany({
    where: {
      userId: lead.userId,
      isActive: true,
      trigger: 'DAYS_AFTER_LIVE_LEAD',
    },
  })
  const matched = templates.filter(
    (t) => t.delayDays >= 0 && t.delayDays <= MAX_DELAY_DAYS,
  )
  if (matched.length === 0) return { generated: 0 }

  const orderLink = lead.liveRoom.orderFormSlug
    ? `https://hulao.id/order/${encodeURIComponent(lead.liveRoom.orderFormSlug)}`
    : `https://hulao.id/live/${encodeURIComponent(lead.liveRoom.slug)}`

  let generated = 0
  for (const template of matched) {
    const existing = await prisma.followUpQueue.findFirst({
      where: {
        liveLeadId,
        templateId: template.id,
        status: { not: 'CANCELLED' },
      },
    })
    if (existing) continue

    const scheduledAt = new Date()
    scheduledAt.setDate(scheduledAt.getDate() + template.delayDays)

    const leadCtx = {
      customerName: lead.customerName,
      productInterest: lead.productInterest,
      storeName: lead.user.name,
      orderLink,
    }
    const resolvedMessage = resolveLeadTemplateVariables(template.message, leadCtx)
    const metaParamMap = Array.isArray(template.metaParamMap) ? (template.metaParamMap as string[]) : null
    const resolvedParams =
      template.metaTemplateId && metaParamMap ? resolveLeadTemplateParams(metaParamMap, leadCtx) : undefined

    await prisma.followUpQueue.create({
      data: {
        userId: lead.userId,
        liveLeadId,
        templateId: template.id,
        scheduledAt,
        resolvedMessage,
        ...(resolvedParams ? { resolvedParams } : {}),
        customerPhone: phone,
        triggerEvent: 'DAYS_AFTER_LIVE_LEAD',
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
