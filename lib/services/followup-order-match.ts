// Pencocokan FollowUpTemplate ↔ order (PURE, tanpa Prisma) — diekstrak dari
// followup-engine.generateQueueForOrder supaya bisa diuji tanpa DB.
//
// Filter di sini sengaja MENGULANG filter query Prisma di engine (isActive,
// trigger, scope/orderFormId) supaya helper benar berdiri sendiri; untuk input
// hasil query tsb hasilnya identik dengan perilaku lama.

export type FollowupEvent =
  | 'ORDER_CREATED'
  | 'PAYMENT_PAID'
  | 'SHIPPED'
  | 'COMPLETED'
  | 'CANCELLED'

export const MAX_DELAY_DAYS = 30

// Field FollowUpTemplate yang dibutuhkan untuk pencocokan.
export interface MatchableTemplate {
  id: string
  trigger: string
  paymentMethod: string | null
  orderType: string | null
  applyOnPaymentStatus: string | null
  applyOnDeliveryStatus: string | null
  delayDays: number
  isActive: boolean
  scope: string
  orderFormId: string | null
  message: string
  metaParamMap: unknown
}

// Field UserOrder yang dibutuhkan untuk pencocokan.
export interface MatchableOrder {
  paymentMethod: string
  isDigitalOnly: boolean
  paymentStatus: string
  deliveryStatus: string
  orderFormId: string | null
  orderSessionId: string | null
  invoiceNumber: string | null
  totalRp: number | null
  items: unknown
}

// Map event → trigger types yang harus dicari di FollowUpTemplate.
// DAYS_AFTER_* di-trigger sekaligus karena base event-nya sama, hanya delay
// yang beda. Misal saat ORDER_CREATED kita generate juga template
// DAYS_AFTER_ORDER (delay 1, 2, dst) dengan scheduledAt = now + delayDays.
export function mapEventToTriggers(event: FollowupEvent): string[] {
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

// Scope GLOBAL berlaku semua order; FORM hanya untuk order dari form yang
// sama. Perbandingan null === null sengaja meniru `orderFormId: null` Prisma
// (IS NULL) di query lama.
function matchesScope(t: MatchableTemplate, order: MatchableOrder): boolean {
  if (t.scope === 'GLOBAL') return true
  return t.scope === 'FORM' && t.orderFormId === order.orderFormId
}

// Filter lama per template (paymentMethod, jenis order, status, delay).
function matchesOrderFilters(t: MatchableTemplate, order: MatchableOrder): boolean {
  if (t.paymentMethod && t.paymentMethod !== order.paymentMethod) return false
  // Filter jenis order: DIGITAL hanya utk order digital-only, PHYSICAL
  // hanya utk order yang punya barang fisik. null = semua.
  if (t.orderType === 'DIGITAL' && !order.isDigitalOnly) return false
  if (t.orderType === 'PHYSICAL' && order.isDigitalOnly) return false
  if (t.applyOnPaymentStatus && t.applyOnPaymentStatus !== order.paymentStatus) {
    return false
  }
  if (t.applyOnDeliveryStatus && t.applyOnDeliveryStatus !== order.deliveryStatus) {
    return false
  }
  if (t.delayDays < 0 || t.delayDays > MAX_DELAY_DAYS) return false
  return true
}

// Kembalikan template (array BARU, urutan input dipertahankan) yang harus
// di-queue untuk `order` pada `event`. Dedup per (order, template) tetap di
// engine karena butuh DB.
export function matchFollowUpTemplatesForOrder<T extends MatchableTemplate>(
  templates: readonly T[],
  order: MatchableOrder,
  event: FollowupEvent,
): T[] {
  const triggers = mapEventToTriggers(event)
  if (triggers.length === 0) return []
  return templates.filter(
    (t) =>
      t.isActive &&
      triggers.includes(t.trigger) &&
      matchesScope(t, order) &&
      matchesOrderFilters(t, order),
  )
}
