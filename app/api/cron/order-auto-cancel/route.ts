// POST or GET /api/cron/order-auto-cancel
//
// Cron tasks Order System (jalankan 12:00 + 00:00 WIB tiap hari):
//   1. Cancel order TRANSFER yang PENDING > 24 jam (tanpa upload bukti)
//   2. Restore Product.flashSaleSold dari order yang di-cancel
//   3. Cleanup ShippingCostCache yang sudah expired
//
// Auth: terpusat di lib/cron-auth.ts (Bearer / x-cron-secret / ?secret=).
import { NextResponse } from 'next/server'

import { requireCronAuth } from '@/lib/cron-auth'
import { prisma } from '@/lib/prisma'

async function handle(req: Request) {
  const authErr = requireCronAuth(req)
  if (authErr) return authErr

  const startedAt = Date.now()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)

  // 1. Find candidate orders.
  const candidates = await prisma.userOrder.findMany({
    where: {
      paymentMethod: 'TRANSFER',
      paymentStatus: 'PENDING',
      createdAt: { lt: cutoff },
      // Skip yang sudah upload bukti (status berubah ke WAITING_CONFIRMATION).
      paymentProofUrl: null,
    },
    select: {
      id: true,
      invoiceNumber: true,
      items: true,
    },
  })

  let cancelled = 0
  for (const order of candidates) {
    try {
      await prisma.$transaction(async (tx) => {
        // Cancel order.
        await tx.userOrder.update({
          where: { id: order.id },
          data: {
            paymentStatus: 'CANCELLED',
            deliveryStatus: 'CANCELLED',
            cancelledAt: new Date(),
            cancelledReason:
              'Auto-cancelled: tidak ada bukti pembayaran dalam 24 jam',
          },
        })

        // Restore flashSaleSold per item flash sale.
        const items =
          (order.items as Array<{
            productId: string
            qty: number
            isFlashSale?: boolean
          }>) ?? []
        for (const item of items) {
          if (!item.isFlashSale) continue
          await tx.product
            .update({
              where: { id: item.productId },
              data: {
                flashSaleSold: { decrement: item.qty },
              },
            })
            .catch(() => {})
        }
      })
      cancelled++
    } catch (err) {
      console.error(
        `[cron/order-auto-cancel] gagal cancel ${order.invoiceNumber}:`,
        err,
      )
    }
  }

  // 2. Cleanup ShippingCostCache expired.
  const cacheDeleted = await prisma.shippingCostCache.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  })

  return NextResponse.json({
    success: true,
    cancelled,
    candidates: candidates.length,
    cacheDeleted: cacheDeleted.count,
    durationMs: Date.now() - startedAt,
  })
}

export async function POST(req: Request) {
  return handle(req)
}

export async function GET(req: Request) {
  return handle(req)
}
