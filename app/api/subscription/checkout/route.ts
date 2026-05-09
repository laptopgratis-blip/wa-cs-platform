// POST /api/subscription/checkout
// Body: { lpPackageId, durationMonths }
//
// Subscription LP sekarang DIBELI DENGAN TOKEN (bukan transfer/Tripay).
// Token sendiri tetap di-top-up via Tripay/Manual Transfer (lihat
// /api/payment/* dan /api/payment/manual/*) — flow itu unchanged.
//
// Flow di sini:
//   1. Validate session + body
//   2. Panggil checkoutSubscriptionWithTokens (atomic deduct + activate)
//   3. Return invoice + subscription info + saldo terbaru
//
// Kalau saldo kurang → 402 + pesan "top-up dulu".
// Kalau race (saldo turun di antara preview dan checkout) → juga 402 — error
// dari service di-throw dgn code='INSUFFICIENT_TOKEN'.
//
// Existing PENDING invoices Tripay/Manual Transfer dari era pre-token-payment
// TIDAK di-handle di sini — tetap berjalan via path /api/subscription/upload-proof
// + admin approve. Sekali approved, tetap ACTIVE seperti biasa.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { checkoutSubscriptionWithTokens } from '@/lib/services/subscription'
import { VALID_DURATIONS } from '@/lib/subscription-pricing'

const bodySchema = z.object({
  lpPackageId: z.string().min(1),
  durationMonths: z.number().int().refine((n) => VALID_DURATIONS.includes(n), {
    message: `Durasi harus salah satu: ${VALID_DURATIONS.join(', ')}`,
  }),
})

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  const { lpPackageId, durationMonths } = parsed.data

  try {
    const result = await checkoutSubscriptionWithTokens({
      userId: session.user.id,
      lpPackageId,
      durationMonths,
    })

    return jsonOk({
      subscriptionId: result.subscriptionId,
      invoiceId: result.invoiceId,
      invoiceNumber: result.invoiceNumber,
      packageName: result.packageName,
      durationMonths: result.durationMonths,
      priceIdr: result.priceIdr,
      tokenAmount: result.tokenAmount,
      pricePerToken: result.pricePerToken,
      startDate: result.startDate.toISOString(),
      endDate: result.endDate.toISOString(),
      remainingBalance: result.remainingBalance,
      paymentMethod: 'TOKEN_BALANCE',
    })
  } catch (err) {
    const code = (err as Error & { code?: string }).code
    if (code === 'INSUFFICIENT_TOKEN') {
      return Response.json(
        {
          success: false,
          error: 'INSUFFICIENT_TOKEN',
          message:
            'Saldo token tidak cukup untuk subscribe. Top-up dulu lalu coba lagi.',
        },
        { status: 402 },
      )
    }
    const msg = err instanceof Error ? err.message : 'Terjadi kesalahan server'
    console.error('[POST /api/subscription/checkout] gagal:', err)
    return jsonError(msg, 400)
  }
}
