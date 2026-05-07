// Zod schema untuk update UserOrder (dari halaman /pesanan).
import { z } from 'zod'

// WAITING_CONFIRMATION ditambah Phase 4 — status saat customer sudah upload
// bukti tapi penjual belum konfirmasi.
export const PAYMENT_STATUSES = [
  'PENDING',
  'WAITING_CONFIRMATION',
  'PAID',
  'CANCELLED',
] as const
export const DELIVERY_STATUSES = [
  'PENDING',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
] as const
export const PAYMENT_METHODS = [
  'COD',
  'TRANSFER',
  'BOOKING',
  'CONSULTATION',
  'FREE',
] as const

export const orderItemSchema = z.object({
  name: z.string().trim().min(1, 'Nama item tidak boleh kosong').max(120),
  qty: z.number().int().min(1).max(9999).default(1),
  price: z.number().min(0).optional().nullable(),
})

export const orderUpdateSchema = z.object({
  customerName: z.string().trim().min(2).max(120).optional(),
  customerPhone: z.string().trim().min(8).max(20).optional(),
  customerAddress: z.string().trim().max(1000).optional().nullable(),
  items: z.array(orderItemSchema).max(50).optional(),
  totalAmount: z.number().min(0).max(1_000_000_000).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  paymentProofUrl: z.string().trim().max(500).optional().nullable(),
  deliveryStatus: z.enum(DELIVERY_STATUSES).optional(),
  trackingNumber: z.string().trim().max(80).optional().nullable(),
  cancelledReason: z.string().trim().max(500).optional().nullable(),
})

export type OrderUpdateInput = z.infer<typeof orderUpdateSchema>
export type OrderItemInput = z.infer<typeof orderItemSchema>

// Tab UI — server filter prisma.where berdasarkan ini.
export const ORDER_TABS = [
  'all',
  'pending', // paymentStatus=PENDING
  'paid', // paymentStatus=PAID, deliveryStatus belum DELIVERED
  'shipped', // deliveryStatus=SHIPPED
  'completed', // deliveryStatus=DELIVERED
] as const
export type OrderTab = (typeof ORDER_TABS)[number]
