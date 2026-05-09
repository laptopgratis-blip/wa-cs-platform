// POST /api/lms-subscription/checkout
// Body: { lmsPackageId, durationMonths }
// Atomic deduct token + activate plan. Mirror /api/subscription/checkout.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { checkoutLmsSubscriptionWithTokens } from '@/lib/services/lms/subscription'
import { VALID_DURATIONS } from '@/lib/subscription-pricing'

const schema = z.object({
  lmsPackageId: z.string().min(1),
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
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  try {
    const result = await checkoutLmsSubscriptionWithTokens({
      userId: session.user.id,
      lmsPackageId: parsed.data.lmsPackageId,
      durationMonths: parsed.data.durationMonths,
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
            'Saldo token tidak cukup untuk subscribe LMS. Top-up dulu lalu coba lagi.',
        },
        { status: 402 },
      )
    }
    const msg = err instanceof Error ? err.message : 'Terjadi kesalahan server'
    console.error('[POST /api/lms-subscription/checkout]', err)
    return jsonError(msg, 400)
  }
}
