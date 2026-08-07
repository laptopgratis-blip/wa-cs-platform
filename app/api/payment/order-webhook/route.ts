// POST /api/payment/order-webhook
// Callback Tripay untuk pembayaran UserOrder (checkout toko publik) —
// webhook per-purpose ke-4, terpisah dari tripay-webhook (token SaaS),
// lp/upgrade/webhook, dan subscription/tripay/callback.
//
// Disiplin sama dgn tripay-webhook: verifikasi HMAC dari RAW body sebelum
// JSON.parse, filter event payment_status, idempotent. Transisi PAID di
// applyOrderTripayStatus (klaim atomik) — side effects hanya saat
// transitioned pertama kali.
import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import {
  applyOrderTripayStatus,
  mapTripayStatus,
  runOrderPaidSideEffects,
} from '@/lib/services/order-payment'
import { verifySignature } from '@/lib/tripay'

interface TripayCallbackPayload {
  reference?: string
  merchant_ref?: string
  payment_method?: string
  total_amount?: number
  fee_customer?: number
  status?: 'PAID' | 'EXPIRED' | 'FAILED' | 'REFUND' | 'UNPAID'
  paid_at?: number | null
}

export async function POST(req: Request) {
  // Signature dihitung dari raw body — JANGAN parse sebelum verifikasi.
  const rawBody = await req.text()
  const signature = req.headers.get('x-callback-signature') ?? ''
  const event = req.headers.get('x-callback-event') ?? ''

  if (!signature || !verifySignature(rawBody, signature)) {
    console.warn('[order-webhook] signature mismatch atau header hilang')
    return NextResponse.json(
      { success: false, error: 'invalid signature' },
      { status: 401 },
    )
  }

  if (event && event !== 'payment_status') {
    return NextResponse.json({ success: true, data: { ignored: event } })
  }

  let body: TripayCallbackPayload
  try {
    body = JSON.parse(rawBody) as TripayCallbackPayload
  } catch {
    return NextResponse.json(
      { success: false, error: 'invalid json' },
      { status: 400 },
    )
  }

  const merchantRef = body.merchant_ref
  const status = body.status
  if (!merchantRef || !status) {
    return NextResponse.json(
      { success: false, error: 'field wajib hilang' },
      { status: 400 },
    )
  }

  try {
    const orderPayment = await prisma.orderPayment.findUnique({
      where: { merchantRef },
      select: { id: true, orderId: true, status: true },
    })
    if (!orderPayment) {
      return NextResponse.json(
        { success: false, error: 'order payment tidak ditemukan' },
        { status: 404 },
      )
    }

    // Idempotent guard cepat — klaim atomik di applyOrderTripayStatus tetap
    // backstop kalau dua webhook lolos guard ini bersamaan.
    if (orderPayment.status === 'SUCCESS') {
      return NextResponse.json({ success: true, data: { idempotent: true } })
    }

    const next = mapTripayStatus(status)
    if (next === 'PENDING') {
      return NextResponse.json({ success: true, data: { status: next } })
    }

    const { transitioned } = await applyOrderTripayStatus({
      orderPaymentId: orderPayment.id,
      orderId: orderPayment.orderId,
      next,
      paidAt: body.paid_at ? new Date(body.paid_at * 1000) : null,
      rawCallback: body as never,
    })

    if (transitioned) {
      runOrderPaidSideEffects(orderPayment.orderId)
    }

    return NextResponse.json({
      success: true,
      data: { status: next, transitioned },
    })
  } catch (err) {
    console.error('[POST /api/payment/order-webhook] gagal:', err)
    return NextResponse.json(
      { success: false, error: 'internal error' },
      { status: 500 },
    )
  }
}
