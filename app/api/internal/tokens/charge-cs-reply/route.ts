// POST /api/internal/tokens/charge-cs-reply
// Khusus untuk wa-service: charge user token untuk balasan CS Reply WA dengan
// skema fair-pricing (token-based proporsional). Beda dari /api/internal/
// tokens/use yang menerima `amount` flat — endpoint ini menghitung amount
// dari (inputTokens, outputTokens) × harga AiModel × margin AiFeatureConfig.
//
// Wrapper tipis di atas lib/services/cs-pipeline/charge — logika dipakai
// bersama dengan webhook Cloud API (tanpa HTTP).
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireServiceSecret } from '@/lib/internal-auth'
import { chargeCsReply } from '@/lib/services/cs-pipeline/charge'

const bodySchema = z.object({
  userId: z.string().min(1),
  sessionId: z.string().min(1),
  // FK ke AiModel.id — bukan modelId string. Endpoint look-up pricing dari row.
  aiModelId: z.string().min(1),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
})

export async function POST(req: Request) {
  const blocked = requireServiceSecret(req)
  if (blocked) return blocked

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 400 },
    )
  }

  const result = await chargeCsReply(body)

  if (result.modelNotFound) {
    return NextResponse.json(
      { success: false, error: 'AiModel tidak ditemukan' },
      { status: 404 },
    )
  }
  if (!result.ok) {
    return NextResponse.json(
      {
        success: false,
        error: 'token tidak cukup',
        tokensRequired: result.tokensCharged,
      },
      { status: 402 },
    )
  }

  return NextResponse.json({
    success: true,
    data: {
      tokensCharged: result.tokensCharged,
      apiCostUsd: result.apiCostUsd,
      apiCostRp: result.apiCostRp,
      revenueRp: result.revenueRp,
      profitRp: result.profitRp,
      marginPct: result.marginPct,
      balance: result.balance ?? 0,
    },
  })
}
