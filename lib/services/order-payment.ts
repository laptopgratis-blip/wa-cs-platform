// Service pembayaran Tripay untuk UserOrder (checkout toko publik).
//
// TERPISAH dari dunia Payment/ManualPayment (top-up token SaaS) — lihat
// komentar model OrderPayment di schema.prisma. Dipakai oleh:
//   - POST /api/orders/submit          → createTripayForOrder
//   - POST /api/payment/order-webhook  → applyOrderTripayStatus + side effects
//   - GET  /api/cron/order-payment-reconcile → idem (jaring pengaman webhook drop)
import type { PaymentStatus, Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { triggerEntitlementsForOrderSafe } from '@/lib/services/entitlement-hook'
import { generateQueueForOrder } from '@/lib/services/followup-engine'
import { firePixelEventForOrder } from '@/lib/services/pixel-fire'
import { createTransaction } from '@/lib/tripay'

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    'http://localhost:3000'
  )
}

export interface CreateTripayForOrderInput {
  // merchant_ref Tripay = invoiceNumber order (unik).
  invoiceNumber: string
  // Nilai order dalam rupiah bulat (= UserOrder.totalRp, TANPA fee).
  amount: number
  customerName: string
  customerEmail: string
  // Kode channel Tripay pilihan customer (BRIVA, QRIS, dll).
  channel: string
  // Ringkasan item utk tampil di halaman bayar Tripay.
  itemsSummary: string
}

export interface TripayOrderPaymentData {
  merchantRef: string
  reference: string
  amount: number
  feeCustomer: number
  channelCode: string
  channelName: string
  payCode: string | null
  checkoutUrl: string
  expiredAt: Date
}

// Buat transaksi Tripay untuk order. Dipanggil SEBELUM $transaction create
// order — kegagalan transaksi DB hanya meninggalkan transaksi Tripay yatim
// yang expired sendiri dalam 24 jam (harmless).
export async function createTripayForOrder(
  input: CreateTripayForOrderInput,
): Promise<TripayOrderPaymentData> {
  const tx = await createTransaction({
    orderId: input.invoiceNumber,
    amount: input.amount,
    itemName: input.itemsSummary,
    itemSku: 'ORDER',
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    method: input.channel,
    callbackUrl: `${baseUrl()}/api/payment/order-webhook`,
    returnUrl: `${baseUrl()}/invoice/${encodeURIComponent(input.invoiceNumber)}`,
    expiresInSeconds: 24 * 60 * 60,
  })
  return {
    merchantRef: input.invoiceNumber,
    reference: tx.reference,
    amount: input.amount,
    // customerAmount Tripay = total yg dibayar customer (nilai order + fee
    // channel). Selisihnya = fee yang dibebankan ke pembeli.
    feeCustomer: Math.max(0, tx.customerAmount - input.amount),
    channelCode: tx.paymentMethod,
    channelName: tx.paymentName,
    payCode: tx.payCode,
    checkoutUrl: tx.paymentUrl,
    expiredAt: tx.expiredAt,
  }
}

// Status Tripay → enum PaymentStatus internal.
export function mapTripayStatus(
  status: 'UNPAID' | 'PAID' | 'EXPIRED' | 'FAILED' | 'REFUND',
): PaymentStatus {
  if (status === 'PAID') return 'SUCCESS'
  if (status === 'EXPIRED') return 'EXPIRED'
  if (status === 'FAILED' || status === 'REFUND') return 'FAILED'
  return 'PENDING'
}

export interface ApplyOrderTripayStatusInput {
  orderPaymentId: string
  orderId: string
  next: PaymentStatus
  paidAt?: Date | null
  // Payload callback mentah utk audit (webhook only; cron tidak punya).
  rawCallback?: Prisma.InputJsonValue
}

// Terapkan status Tripay ke OrderPayment + (kalau SUCCESS) klaim transisi
// order → PAID secara atomik. Idempotensi deterministik: updateMany
// bersyarat `paymentStatus != PAID` — webhook ganda / race webhook-vs-cron
// menghasilkan claimed.count = 0 → transitioned = false, side effects skip.
export async function applyOrderTripayStatus(
  input: ApplyOrderTripayStatusInput,
): Promise<{ transitioned: boolean }> {
  return prisma.$transaction(async (tx) => {
    await tx.orderPayment.update({
      where: { id: input.orderPaymentId },
      data: {
        status: input.next,
        paidAt: input.next === 'SUCCESS' ? input.paidAt ?? new Date() : null,
        ...(input.rawCallback !== undefined && {
          rawCallback: input.rawCallback,
        }),
      },
    })

    if (input.next !== 'SUCCESS') return { transitioned: false }

    const claimed = await tx.userOrder.updateMany({
      where: { id: input.orderId, paymentStatus: { not: 'PAID' } },
      data: {
        paymentStatus: 'PAID',
        paidAt: input.paidAt ?? new Date(),
        autoConfirmedAt: new Date(),
        autoConfirmedBy: 'TRIPAY',
      },
    })
    return { transitioned: claimed.count === 1 }
  })
}

// Side effects pasca order → PAID via Tripay. Dipanggil HANYA saat
// transitioned=true (sekali per order). Semua best-effort fire-and-forget —
// webhook harus balas cepat & tidak boleh gagal karena notif.
export function runOrderPaidSideEffects(orderId: string): void {
  firePixelEventForOrder({ orderId, eventName: 'Purchase' }).catch((e) => {
    console.error(`[order-payment] pixel fire gagal ${orderId}:`, e)
  })
  generateQueueForOrder(orderId, 'PAYMENT_PAID').catch((e) => {
    console.error(`[order-payment] followup gagal ${orderId}:`, e)
  })
  // Entitlement digital (LMS course + e-book) via dispatcher.
  triggerEntitlementsForOrderSafe(orderId)
}
