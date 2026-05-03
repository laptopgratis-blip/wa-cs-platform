// POST /api/lp/upgrade/webhook
// Endpoint Tripay khusus untuk LP upgrade payment. Verifikasi signature
// HMAC-SHA256(privateKey, raw_body) dari header X-Callback-Signature.
//
// Beda dengan /api/payment/tripay-webhook (yang handle TOKEN_PURCHASE):
// - Pada SUCCESS: panggil applyLpUpgradeFromPackage (set tier+kuota), bukan
//   kredit token balance.
// - Tidak buat TokenTransaction (LP upgrade bukan token movement).
// Idempotent: skip kalau sudah SUCCESS.
import { NextResponse } from 'next/server'

import { applyLpUpgradeFromPackage } from '@/lib/lp-quota'
import { prisma } from '@/lib/prisma'
import { verifySignature } from '@/lib/tripay'

interface TripayCallbackPayload {
  reference?: string
  merchant_ref?: string
  payment_method?: string
  total_amount?: number
  status?: 'PAID' | 'EXPIRED' | 'FAILED' | 'REFUND' | 'UNPAID'
  paid_at?: number | null
}

export async function POST(req: Request) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-callback-signature') ?? ''
  const event = req.headers.get('x-callback-event') ?? ''

  if (!signature || !verifySignature(rawBody, signature)) {
    console.warn('[lp-upgrade webhook] signature mismatch atau header hilang')
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
      include: { lpPackage: true },
    })
    if (!payment) {
      return NextResponse.json(
        { success: false, error: 'order tidak ditemukan' },
        { status: 404 },
      )
    }

    // Defensive: kalau Tripay nge-callback ke webhook ini tapi purpose-nya
    // bukan LP_UPGRADE, refuse — supaya kita tidak accidentally apply LP
    // upgrade ke pembelian token.
    if (payment.purpose !== 'LP_UPGRADE') {
      return NextResponse.json(
        { success: false, error: 'order bukan LP upgrade' },
        { status: 409 },
      )
    }
    if (!payment.lpPackage) {
      return NextResponse.json(
        { success: false, error: 'paket LP tidak ditemukan' },
        { status: 404 },
      )
    }
    // Pull ke local supaya narrowing tidak hilang setelah await berikutnya.
    const lpPkg = payment.lpPackage

    if (payment.status === 'SUCCESS') {
      return NextResponse.json({ success: true, data: { idempotent: true } })
    }

    let next: 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED' | 'CANCELLED' = 'PENDING'
    if (status === 'PAID') next = 'SUCCESS'
    else if (status === 'EXPIRED') next = 'EXPIRED'
    else if (status === 'FAILED' || status === 'REFUND') next = 'FAILED'
    else if (status === 'UNPAID') next = 'PENDING'

    await prisma.payment.update({
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
      try {
        await applyLpUpgradeFromPackage(payment.userId, {
          tier: lpPkg.tier,
          maxLp: lpPkg.maxLp,
          maxStorageMB: lpPkg.maxStorageMB,
        })
      } catch (quotaErr) {
        // Failure di sini tidak boleh fail-kan webhook (uang user sudah masuk
        // ke kita; admin bisa apply manual kalau perlu).
        console.error('[lp-upgrade webhook] gagal apply tier:', quotaErr)
      }
    }

    return NextResponse.json({ success: true, data: { status: next } })
  } catch (err) {
    console.error('[POST /api/lp/upgrade/webhook] gagal:', err)
    return NextResponse.json(
      { success: false, error: 'internal error' },
      { status: 500 },
    )
  }
}
