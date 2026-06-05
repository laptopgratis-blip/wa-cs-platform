// Helper wrapper untuk service yang charge per UNIT (chars/seconds/tokens)
// alih-alih input+output tokens Anthropic. Dipakai untuk OpenAI TTS,
// Whisper, embedding — service yang sebelumnya tidak track cost.
//
// Pattern:
//   await chargeUsage({ userId, featureKey, units, reference, description })
// Caller panggil SETELAH API sukses (provider cost sudah keluar). Helper:
//   1. Hitung charge dari units × inputPricePer1M (treat outputTokens=0).
//   2. Log ke AiGenerationLog.
//   3. Atomic deduct dari token balance user (race-safe).
//   4. Throw InsufficientBalanceError kalau balance kurang (caller di-WA harus
//      handle — service udah dilayani, user gak charge).
//
// Untuk caching scenario (TTS hit cache): caller skip call helper ini —
// gak ada API call ke OpenAI, gak charge ulang.

import { randomUUID } from 'node:crypto'

import {
  computeChargeFromUsage,
  deductTokenAtomic,
  hasEnoughBalance,
  InsufficientBalanceError,
  logGeneration,
  type ComputedCharge,
} from './ai-generation-log'

export interface ChargeUsageInput {
  userId: string
  featureKey: string
  // Units di-charge — semantik tergantung featureKey:
  //   LIVE_TTS_OPENAI       → character count text input
  //   WHISPER_TRANSCRIBE_OPENAI → audio second hasil transcript
  //   KLIP_LIVE_EMBED       → token count input
  units: number
  // Reference unik untuk dedup TokenTransaction. Helper append UUID otomatis.
  reference: string
  description: string
  subjectType?: string
  subjectId?: string
}

export async function chargeUsage(
  input: ChargeUsageInput,
): Promise<ComputedCharge> {
  // Compute charge dari units (treat sebagai inputTokens).
  const charge = await computeChargeFromUsage({
    featureKey: input.featureKey,
    inputTokens: input.units,
    outputTokens: 0,
  })

  // Pre-flight balance check — log INSUFFICIENT_BALANCE + throw kalau
  // saldo gak cukup. API call udah keluar duitnya, jadi log untuk audit.
  const enough = await hasEnoughBalance(input.userId, charge.tokensCharged)
  if (!enough) {
    await logGeneration({
      featureKey: input.featureKey,
      userId: input.userId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      charge,
      status: 'INSUFFICIENT_BALANCE',
    })
    throw new InsufficientBalanceError(charge.tokensCharged)
  }

  // Atomic deduct + log.
  const deductResult = await deductTokenAtomic({
    userId: input.userId,
    tokensCharged: charge.tokensCharged,
    description: input.description,
    reference: `${input.reference}:${randomUUID()}`,
  })

  await logGeneration({
    featureKey: input.featureKey,
    userId: input.userId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    charge,
    status: deductResult.ok ? 'OK' : 'INSUFFICIENT_BALANCE',
  })

  if (!deductResult.ok) {
    throw new InsufficientBalanceError(charge.tokensCharged)
  }

  return charge
}
