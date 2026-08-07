// GET/POST /api/cron/order-payment-reconcile
//
// Jaring pengaman webhook drop untuk pembayaran Tripay UserOrder — cermin
// app/api/cron/payment-reconcile (dunia token SaaS) tapi atas OrderPayment.
// Poll getTransactionDetail untuk OrderPayment PENDING <24 jam; status final
// diterapkan lewat applyOrderTripayStatus (klaim atomik yg sama dgn webhook,
// race aman) + side effects hanya saat transisi pertama.
//
// Jadwalkan tiap 10 menit via cron-job.org dengan CRON_SECRET.
import { NextResponse } from 'next/server'

import { requireCronAuth } from '@/lib/cron-auth'
import { prisma } from '@/lib/prisma'
import {
  applyOrderTripayStatus,
  mapTripayStatus,
  runOrderPaidSideEffects,
} from '@/lib/services/order-payment'
import { getTransactionDetail } from '@/lib/tripay'

// >24 jam: transaksi Tripay sudah pasti expired — biarkan; order PENDING
// akan dibersihkan alur lain (customer retry / seller cancel manual).
const RECONCILE_WINDOW_MS = 24 * 60 * 60 * 1000
const MAX_PER_RUN = 100

interface Summary {
  checked: number
  paid: number
  expired: number
  failed: number
  unchanged: number
  errors: number
}

async function reconcileOne(op: {
  id: string
  orderId: string
  reference: string | null
}): Promise<keyof Summary> {
  if (!op.reference) return 'unchanged'

  let detail
  try {
    detail = await getTransactionDetail(op.reference)
  } catch (err) {
    console.error(
      '[order-payment-reconcile] getTransactionDetail gagal:',
      op.reference,
      err,
    )
    return 'errors'
  }

  const next = mapTripayStatus(detail.status)
  if (next === 'PENDING') return 'unchanged'

  try {
    const { transitioned } = await applyOrderTripayStatus({
      orderPaymentId: op.id,
      orderId: op.orderId,
      next,
      paidAt: detail.paid_at ? new Date(detail.paid_at * 1000) : null,
    })
    if (transitioned) runOrderPaidSideEffects(op.orderId)
  } catch (err) {
    console.error('[order-payment-reconcile] apply gagal:', op.id, err)
    return 'errors'
  }

  if (next === 'SUCCESS') return 'paid'
  if (next === 'EXPIRED') return 'expired'
  return 'failed'
}

async function run(req: Request) {
  const authErr = requireCronAuth(req)
  if (authErr) return authErr

  const cutoff = new Date(Date.now() - RECONCILE_WINDOW_MS)
  const candidates = await prisma.orderPayment.findMany({
    where: {
      status: 'PENDING',
      reference: { not: null },
      createdAt: { gte: cutoff },
    },
    orderBy: { createdAt: 'asc' },
    take: MAX_PER_RUN,
    select: { id: true, orderId: true, reference: true },
  })

  const summary: Summary = {
    checked: candidates.length,
    paid: 0,
    expired: 0,
    failed: 0,
    unchanged: 0,
    errors: 0,
  }
  for (const op of candidates) {
    const outcome = await reconcileOne(op)
    if (outcome !== 'checked') summary[outcome]++
  }

  console.log('[order-payment-reconcile]', JSON.stringify(summary))
  return NextResponse.json({ success: true, data: summary })
}

export async function GET(req: Request) {
  return run(req)
}

export async function POST(req: Request) {
  return run(req)
}
