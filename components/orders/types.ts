// Shared types untuk komponen Orders.

export interface OrderItem {
  name: string
  qty: number
  price?: number | null
}

export interface OrderTagBadge {
  id: string
  name: string
  color: string
}

// Ringkasan pesanan "perlu dikemas" per gudang — strip fulfillment di /pesanan.
export interface WarehouseSummaryItem {
  warehouseId: string
  name: string
  isActive: boolean
  count: number
}
export interface WarehouseSummary {
  warehouses: WarehouseSummaryItem[]
  noneCount: number
  total: number
}

export interface OrderListItem {
  id: string
  customerName: string
  customerPhone: string
  customerEmail?: string | null
  customerAddress: string | null
  items: OrderItem[]
  totalAmount: number | null
  paymentMethod: string
  paymentStatus: string
  deliveryStatus: string
  trackingNumber: string | null
  flowName: string | null
  notes: string | null
  notesAdmin?: string | null
  contactId: string | null
  createdAt: string
  updatedAt: string
  invoiceNumber?: string | null
  paymentProofUrl?: string | null
  shippingAddress?: string | null
  shippingCourier?: string | null
  shippingService?: string | null
  shippingCityName?: string | null
  shippingDistrictName?: string | null
  shippingSubdistrictName?: string | null
  shippingProvinceName?: string | null
  // Multi-gudang: gudang asal terpilih saat order dibuat (untuk fulfillment).
  originSnapshot?: { name?: string; cityName?: string } | null
  subtotalRp?: number
  flashSaleDiscountRp?: number
  shippingCostRp?: number
  shippingSubsidyRp?: number
  appliedZoneName?: string | null
  totalRp?: number
  uniqueCode?: number | null
  paidAt?: string | null
  shippedAt?: string | null
  deliveredAt?: string | null
  autoConfirmedBy?: string | null
  autoConfirmedAt?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  fbclid?: string | null
  gclid?: string | null
  ttclid?: string | null
  pixelLeadFiredAt?: string | null
  pixelPurchaseFiredAt?: string | null
  orderForm?: { id: string; name: string; slug: string } | null
  tags?: OrderTagBadge[]
}

export interface OrdersCounts {
  all: number
  pending: number
  paid: number
  shipped: number
  completed: number
}

// Periode kartu statistik header (strip) — terpisah dari filter list.
export type StatsRange = 'today' | '12h' | '24h' | '7d' | 'custom'

export interface OrdersTotals {
  todayCount: number
  // Total nilai semua pesanan dalam periode (exclude CANCELLED).
  todayTotalRp: number
  // Porsi yang belum dibayar (COD + transfer PENDING/WAITING_CONFIRMATION).
  todayUnpaidRp: number
  // Dilunasi dalam periode berbasis paidAt (order lama yang lunas ikut).
  todayPaidRp: number
  urgentCount: number
}

export type SmartFilter =
  | 'urgent'
  | 'need_ship'
  | 'need_tracking'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'auto_confirmed'
  | 'unpaid_24h'

export type ViewMode = 'table' | 'card'

export type QuickAction =
  | 'mark_paid'
  | 'mark_shipped'
  | 'mark_delivered'
  | 'reject'
