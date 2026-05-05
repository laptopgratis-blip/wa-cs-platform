// GET /api/payment/status?orderId=WA-xxx
// Poll status pembayaran dari Tripay + sync ke DB lokal.
// Dipakai oleh CheckoutStatusPoller untuk auto-update halaman checkout.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { upgradeTierFromPurchase } from '@/lib/lp-quota'
import { prisma } from '@/lib/prisma'
import { getTransactionDetail } from '@/lib/tripay'

export async function GET(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const url = new URL(req.url)
  const orderId = url.searchParams.get('orderId')
  if (!orderId) return jsonError('Parameter orderId wajib', 400)

  try {
    const payment = await prisma.payment.findUnique({ where: { orderId } })
    if (!payment) return jsonError('Order tidak ditemukan', 404)
    if (payment.userId !== session.user.id) return jsonError('Forbidden', 403)

    // Kalau sudah final (SUCCESS/FAILED/EXPIRED/CANCELLED), return langsung tanpa hit Tripay.
    if (['SUCCESS', 'FAILED', 'EXPIRED', 'CANCELLED'].includes(payment.status)) {
      return jsonOk({
        status: payment.status,
        paidAt: payment.paidAt?.toISOString() ?? null,
      })
    }

    // Cek apakah sudah expired by time tapi belum di-update.
    if (payment.expiredAt && payment.expiredAt.getTime() < Date.now()) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'EXPIRED' },
      })
      return jsonOk({ status: 'EXPIRED', paidAt: null })
    }

    // Poll Tripay kalau ada reference.
    if (!payment.reference) {
      return jsonOk({ status: payment.status, paidAt: null })
    }

    const detail = await getTransactionDetail(payment.reference)

    // Map Tripay status → enum kita.
    let next: 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED' | 'CANCELLED' = 'PENDING'
    if (detail.status === 'PAID') next = 'SUCCESS'
    else if (detail.status === 'EXPIRED') next = 'EXPIRED'
    else if (detail.status === 'FAILED' || detail.status === 'REFUND') next = 'FAILED'
    else if (detail.status === 'UNPAID') next = 'PENDING'

    // Kalau status berubah, update DB.
    if (next !== payment.status) {
      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: next,
            paidAt:
              next === 'SUCCESS'
                ? detail.paid_at
                  ? new Date(detail.paid_at * 1000)
                  : new Date()
                : null,
          },
        })

        // Kredit token kalau PAID.
        if (next === 'SUCCESS') {
          await tx.tokenBalance.upsert({
            where: { userId: payment.userId },
            create: {
              userId: payment.userId,
              balance: payment.tokenAmount,
              totalPurchased: payment.tokenAmount,
            },
            update: {
              balance: { increment: payment.tokenAmount },
              totalPurchased: { increment: payment.tokenAmount },
            },
          })
          await tx.tokenTransaction.create({
            data: {
              userId: payment.userId,
              amount: payment.tokenAmount,
              type: 'PURCHASE',
              description: `Pembelian via Tripay (${payment.paymentMethod ?? 'unknown'})`,
              reference: orderId,
            },
          })
        }
      })

      // Upgrade tier LP (di luar transaksi).
      if (next === 'SUCCESS') {
        try {
          await upgradeTierFromPurchase(payment.userId, payment.tokenAmount)
        } catch (quotaErr) {
          console.error('[GET /api/payment/status] gagal upgrade tier:', quotaErr)
        }
      }
    }

    return jsonOk({
      status: next,
      paidAt:
        next === 'SUCCESS'
          ? detail.paid_at
            ? new Date(detail.paid_at * 1000).toISOString()
            : new Date().toISOString()
          : null,
    })
  } catch (err) {
    console.error('[GET /api/payment/status] gagal:', err)
    return jsonError('Gagal mengecek status pembayaran', 500)
  }
}
