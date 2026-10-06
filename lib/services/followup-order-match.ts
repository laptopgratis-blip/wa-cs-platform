// Pencocokan FollowUpTemplate ↔ order (PURE, tanpa Prisma) — diekstrak dari
// followup-engine.generateQueueForOrder supaya bisa diuji tanpa DB.
//
// Filter di sini sengaja MENGULANG filter query Prisma di engine (isActive,
// trigger, scope/orderFormId) supaya helper benar berdiri sendiri; untuk input
// hasil query tsb hasilnya identik dengan perilaku lama.

export type FollowupEvent =
  'ORDER_CREATED' | 'PAYMENT_PAID' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED'

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
function matchesOrderFilters(
  t: MatchableTemplate,
  order: MatchableOrder,
): boolean {
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
}

// ── Guard order Sales Flow (orderSessionId terisi) ─────────────────────────
// Order dari Sales Flow WA dibuat otomatis oleh flow-engine: TANPA invoice,
// total 0, items kosong, dan flow sudah mengirim konfirmasi + info bank
// sendiri. Order non-flow TIDAK kena guard ini (perilaku lama utuh).

// Metode tanpa tagihan — jangan kirim konfirmasi/pengingat bayar.
const NON_BILLING_PAYMENT_METHODS: readonly string[] = [
  'BOOKING',
  'CONSULTATION',
  'FREE',
]
const ORDER_STAGE_TRIGGERS: readonly string[] = [
  'ORDER_CREATED',
  'DAYS_AFTER_ORDER',
]

// Placeholder yang butuh data order tertentu; kalau datanya kosong pesan jadi
// "Invoice -" / "Rp 0" yang menyesatkan customer.
function placeholderHasData(order: MatchableOrder): Record<string, boolean> {
  const hasInvoice = Boolean(order.invoiceNumber)
  return {
    '{invoice}': hasInvoice,
    '{invoice_url}': hasInvoice,
    '{total}': Boolean(order.totalRp && order.totalRp > 0),
    '{produk}': Array.isArray(order.items) && order.items.length > 0,
  }
}

function templateTexts(t: MatchableTemplate): string[] {
  const params = Array.isArray(t.metaParamMap)
    ? t.metaParamMap.filter((p): p is string => typeof p === 'string')
    : []
  return [t.message, ...params]
}

function usesMissingOrderData(
  t: MatchableTemplate,
  order: MatchableOrder,
): boolean {
  const texts = templateTexts(t)
  return Object.entries(placeholderHasData(order)).some(
    ([placeholder, hasData]) =>
      !hasData && texts.some((txt) => txt.includes(placeholder)),
  )
}

function passesSalesFlowGuard(
  t: MatchableTemplate,
  order: MatchableOrder,
): boolean {
  if (!order.orderSessionId) return true
  // (a) Konfirmasi order sudah dikirim flow-engine sendiri.
  if (t.trigger === 'ORDER_CREATED') return false
  // (b) Tanpa tagihan → tak ada konfirmasi/pengingat bayar.
  if (
    NON_BILLING_PAYMENT_METHODS.includes(order.paymentMethod) &&
    ORDER_STAGE_TRIGGERS.includes(t.trigger)
  ) {
    return false
  }
  // (c) Placeholder yang datanya kosong — HANYA tahap order (jalur baru dari
  // flow-engine). Event lanjutan (PAYMENT_PAID/SHIPPED/COMPLETED/CANCELLED)
  // sejak dulu sudah meng-queue template default ber-{invoice} untuk order
  // flow lewat PATCH/bulk-update/auto-paid; jangan diputus (info resi,
  // konfirmasi bayar, panen testimoni tetap jalan).
  if (!ORDER_STAGE_TRIGGERS.includes(t.trigger)) return true
  return !usesMissingOrderData(t, order)
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
      matchesOrderFilters(t, order) &&
      passesSalesFlowGuard(t, order),
  )
}
