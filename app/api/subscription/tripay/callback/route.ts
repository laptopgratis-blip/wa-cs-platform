// POST /api/subscription/tripay/callback — webhook Tripay untuk subscription invoice.
// Verify signature pakai HMAC-SHA256(privateKey, raw_body) seperti webhook token.
// Idempotent: kalau invoice sudah PAID, skip activation ulang.
//
// Endpoint publik (tanpa auth user) — security murni dari signature.
import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { activateSubscription } from '@/lib/services/subscription'
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
    console.warn('[subscription tripay-webhook] signature mismatch')
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
      { success: false, error: 'body tidak valid JSON' },
      { status: 400 },
    )
  }

  if (!body.reference || !body.merchant_ref) {
    return NextResponse.json(
      { success: false, error: 'reference/merchant_ref hilang' },
      { status: 400 },
    )
  }

  // Cari invoice. JANGAN auto-create — kalau merchant_ref tidak match, abaikan
  // (mungkin webhook untuk Payment token-purchase, beda endpoint).
  const invoice = await prisma.subscriptionInvoice.findUnique({
    where: { tripayMerchantRef: body.merchant_ref },
    include: { subscription: true },
  })
  if (!invoice) {
    // Mungkin webhook untuk Payment biasa — bukan subscription. Webhook lama
    // (/api/payment/tripay-webhook) yg handle. Acknowledge tanpa error supaya
    // Tripay tidak retry forever.
    return NextResponse.json({
      success: true,
      data: { ignored: 'merchant_ref tidak match subscription invoice' },
    })
  }

  // Idempotent
  if (invoice.status === 'PAID') {
    return NextResponse.json({
      success: true,
      data: { alreadyPaid: true, invoiceId: invoice.id },
    })
  }

  if (body.status === 'PAID') {
    // Wrap mark-PAID + activate dalam satu transaksi: kalau aktivasi gagal,
    // invoice tidak boleh ter-tag PAID (mencegah inconsistent state — invoice
    // PAID tapi subscription tidak aktif). Notifikasi fire setelah commit.
    try {
      await prisma.$transaction(async (tx) => {
        await tx.subscriptionInvoice.update({
          where: { id: invoice.id },
          data: {
            status: 'PAID',
            paidAt: body.paid_at
              ? new Date(body.paid_at * 1000)
              : new Date(),
          },
        })
        await activateSubscription(invoice.subscriptionId, tx)
      })
    } catch (err) {
      console.error(
        '[subscription tripay-webhook] activate atomik gagal:',
        invoice.subscriptionId,
        err,
      )
      // Return 500 supaya Tripay retry — invoice masih UNPAID di DB,
      // operator bisa investigate kalau retry juga gagal.
      return NextResponse.json(
        { success: false, error: 'activation failed' },
        { status: 500 },
      )
    }
    return NextResponse.json({ success: true })
  }

  if (body.status === 'EXPIRED' || body.status === 'FAILED') {
    await prisma.subscriptionInvoice.update({
      where: { id: invoice.id },
      data: { status: 'EXPIRED' },
    })
    // Cancel subscription PENDING — invoice tidak akan bisa dibayar lagi.
    if (invoice.subscription.status === 'PENDING') {
      await prisma.subscription.update({
        where: { id: invoice.subscriptionId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledReason: `Tripay ${body.status}`,
        },
      })
    }
    return NextResponse.json({ success: true })
  }

  // Status lain (UNPAID/REFUND) — log saja, tidak ubah state.
  return NextResponse.json({
    success: true,
    data: { ignoredStatus: body.status },
  })
}
