// POST /api/payment/tripay-webhook
// Endpoint Tripay untuk notifikasi status pembayaran (callback URL).
//
// Verifikasi signature pakai HMAC-SHA256(privateKey, raw_body) dari header
// X-Callback-Signature. Idempotent: kalau Payment sudah SUCCESS, skip kredit.
//
// Catatan: endpoint publik (tanpa auth user) — keamanan murni dari signature.
import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { applyPaymentCredit } from '@/lib/billing/apply-payment-credit'
import { verifySignature } from '@/lib/tripay'

interface TripayCallbackPayload {
  reference?: string
  merchant_ref?: string
  payment_method?: string
  payment_method_code?: string
  total_amount?: number
  fee_merchant?: number
  fee_customer?: number
  total_fee?: number
  amount_received?: number
  is_closed_payment?: number
  status?: 'PAID' | 'EXPIRED' | 'FAILED' | 'REFUND' | 'UNPAID'
  paid_at?: number | null
  note?: string | null
}

export async function POST(req: Request) {
  // Tripay tanda-tangan dihitung dari raw body — JANGAN parse dulu sebelum
  // verifikasi.
  const rawBody = await req.text()
  const signature = req.headers.get('x-callback-signature') ?? ''
  const event = req.headers.get('x-callback-event') ?? ''

  if (!signature || !verifySignature(rawBody, signature)) {
    console.warn('[tripay-webhook] signature mismatch atau header hilang')
    return NextResponse.json(
      { success: false, error: 'invalid signature' },
      { status: 401 },
    )
  }

  // Tripay kirim beberapa event; kita hanya peduli payment_status.
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
  const reference = body.reference
  const status = body.status

  if (!merchantRef || !status) {
    return NextResponse.json(
      { success: false, error: 'field wajib hilang' },
      { status: 400 },
    )
  }

  try {
    const payment = await prisma.payment.findUnique({
      where: { orderId: merchantRef },
    })
    if (!payment) {
      return NextResponse.json(
        { success: false, error: 'order tidak ditemukan' },
        { status: 404 },
      )
    }

    // Idempotent guard: kalau sudah SUCCESS, jangan double-credit.
    if (payment.status === 'SUCCESS') {
      return NextResponse.json({ success: true, data: { idempotent: true } })
    }

    // Map Tripay status → enum kita.
    let next: 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED' | 'CANCELLED' = 'PENDING'
    if (status === 'PAID') next = 'SUCCESS'
    else if (status === 'EXPIRED') next = 'EXPIRED'
    else if (status === 'FAILED' || status === 'REFUND') next = 'FAILED'
    else if (status === 'UNPAID') next = 'PENDING'

    try {
      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: next,
            paymentMethod: body.payment_method ?? payment.paymentMethod,
            reference: reference ?? payment.reference,
            paidAt:
              next === 'SUCCESS'
                ? body.paid_at
                  ? new Date(body.paid_at * 1000)
                  : new Date()
                : null,
          },
        })

        if (next === 'SUCCESS') {
          // Cabang by purpose: token AI vs Kredit Pesan WA (Trek 2B).
          await applyPaymentCredit(tx, {
            userId: payment.userId,
            purpose: payment.purpose,
            amount: payment.tokenAmount,
            reference: merchantRef,
            description: `Pembelian via Tripay (${body.payment_method ?? 'unknown'})`,
          })
          // Catatan 2026-07-14: top-up token TIDAK lagi menaikkan tier kuota
          // LP — tier murni dari subscription (lib/services/subscription.ts).
        }
      })
    } catch (txErr) {
      // P2002 = unique constraint violation di TokenTransaction (userId,
      // reference, type). Artinya webhook+polling race — sudah ada baris
      // PURCHASE untuk merchantRef ini. Treat as already-processed.
      if (
        txErr instanceof Prisma.PrismaClientKnownRequestError &&
        txErr.code === 'P2002'
      ) {
        return NextResponse.json({
          success: true,
          data: { idempotent: true, dedupBy: 'unique_constraint' },
        })
      }
      throw txErr
    }

    return NextResponse.json({ success: true, data: { status: next } })
  } catch (err) {
    console.error('[POST /api/payment/tripay-webhook] gagal:', err)
    return NextResponse.json(
      { success: false, error: 'internal error' },
      { status: 500 },
    )
  }
}
