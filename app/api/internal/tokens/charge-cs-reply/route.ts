// POST /api/internal/tokens/charge-cs-reply
// Khusus untuk wa-service: charge user token untuk balasan CS Reply WA dengan
// skema fair-pricing (token-based proporsional). Beda dari /api/internal/
// tokens/use yang menerima `amount` flat — endpoint ini menghitung amount
// dari (inputTokens, outputTokens) × harga AiModel × margin AiFeatureConfig.
//
// wa-service WAJIB pakai endpoint ini setelah generate AI sukses, dengan
// `response.usage.input_tokens / output_tokens` real.
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireServiceSecret } from '@/lib/internal-auth'
import { prisma } from '@/lib/prisma'
import {
  computeChargeFromUsage,
  deductTokenAtomic,
  logGeneration,
} from '@/lib/services/ai-generation-log'

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

  const model = await prisma.aiModel.findUnique({
    where: { id: body.aiModelId },
    select: {
      id: true,
      modelId: true,
      inputPricePer1M: true,
      outputPricePer1M: true,
    },
  })
  if (!model) {
    return NextResponse.json(
      { success: false, error: 'AiModel tidak ditemukan' },
      { status: 404 },
    )
  }

  const charge = await computeChargeFromUsage({
    featureKey: 'CS_REPLY',
    inputTokens: body.inputTokens,
    outputTokens: body.outputTokens,
    priceOverride: {
      modelName: model.modelId,
      inputPricePer1M: model.inputPricePer1M,
      outputPricePer1M: model.outputPricePer1M,
    },
  })

  const ded = await deductTokenAtomic({
    userId: body.userId,
    tokensCharged: charge.tokensCharged,
    description: `CS Reply via ${model.modelId}`,
    reference: `cs_reply:${body.sessionId}`,
  })

  await logGeneration({
    featureKey: 'CS_REPLY',
    userId: body.userId,
    subjectType: 'WA_SESSION',
    subjectId: body.sessionId,
    charge,
    status: ded.ok ? 'OK' : 'INSUFFICIENT_BALANCE',
    errorMessage: ded.ok ? undefined : 'Saldo habis saat charge CS reply',
  })

  if (!ded.ok) {
    return NextResponse.json(
      {
        success: false,
        error: 'token tidak cukup',
        tokensRequired: charge.tokensCharged,
      },
      { status: 402 },
    )
  }

  const balanceRow = await prisma.tokenBalance.findUnique({
    where: { userId: body.userId },
    select: { balance: true },
  })

  return NextResponse.json({
    success: true,
    data: {
      tokensCharged: charge.tokensCharged,
      apiCostUsd: charge.apiCostUsd,
      apiCostRp: charge.apiCostRp,
      revenueRp: charge.revenueRp,
      profitRp: charge.profitRp,
      marginPct: charge.marginPct,
      balance: balanceRow?.balance ?? 0,
    },
  })
}
