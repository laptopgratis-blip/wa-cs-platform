// GET /api/payment/status?orderId=WA-xxx
// Poll status pembayaran dari Tripay + sync ke DB lokal.
// Dipakai oleh CheckoutStatusPoller untuk auto-update halaman checkout.
import { Prisma } from '@prisma/client'
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { applyPaymentCredit } from '@/lib/billing/apply-payment-credit'
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
      try {
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

          // Kredit kalau PAID — cabang by purpose (token / kredit pesan).
          if (next === 'SUCCESS') {
            await applyPaymentCredit(tx, {
              userId: payment.userId,
              purpose: payment.purpose,
              amount: payment.tokenAmount,
              reference: orderId,
              description: `Pembelian via Tripay (${payment.paymentMethod ?? 'unknown'})`,
            })
            // Catatan 2026-07-14: top-up tidak lagi menaikkan tier kuota LP.
          }
        })
      } catch (txErr) {
        // P2002 = unique TokenTransaction (userId, reference, type).
        // Webhook sudah jalan duluan untuk orderId ini → biarkan webhook
        // jadi source of truth, return status terakhir dari DB.
        if (
          txErr instanceof Prisma.PrismaClientKnownRequestError &&
          txErr.code === 'P2002'
        ) {
          const refreshed = await prisma.payment.findUnique({
            where: { id: payment.id },
          })
          return jsonOk({
            status: refreshed?.status ?? next,
            paidAt: refreshed?.paidAt?.toISOString() ?? null,
          })
        }
        throw txErr
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
