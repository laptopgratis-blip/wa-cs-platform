// Shared types untuk komponen Orders.

export interface OrderItem {
  name: string
  qty: number
  price?: number | null
}

export interface OrderListItem {
  id: string
  customerName: string
  customerPhone: string
  customerAddress: string | null
  items: OrderItem[]
  totalAmount: number | null
  paymentMethod: string
  paymentStatus: string
  deliveryStatus: string
  trackingNumber: string | null
  flowName: string | null
  notes: string | null
  contactId: string | null
  createdAt: string
  updatedAt: string
  invoiceNumber?: string | null
  paymentProofUrl?: string | null
  shippingCourier?: string | null
  shippingService?: string | null
  shippingCityName?: string | null
  shippingProvinceName?: string | null
  subtotalRp?: number
  flashSaleDiscountRp?: number
  shippingCostRp?: number
  shippingSubsidyRp?: number
  appliedZoneName?: string | null
  totalRp?: number
  uniqueCode?: number | null
  pixelLeadFiredAt?: string | null
  pixelPurchaseFiredAt?: string | null
}

export interface OrdersCounts {
  all: number
  pending: number
  paid: number
  shipped: number
  completed: number
}

export interface OrdersTotals {
  todayCount: number
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

export type ViewMode = 'table' | 'card'

export type QuickAction =
  | 'mark_paid'
  | 'mark_shipped'
  | 'mark_delivered'
  | 'reject'
