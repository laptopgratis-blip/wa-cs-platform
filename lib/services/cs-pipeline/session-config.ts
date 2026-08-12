// Konfigurasi AI satu sesi WA: soul (system prompt jadi), model, pricing.
// Diekstrak dari app/api/internal/soul/[sessionId]/route.ts.

import { getPricingSettings } from '@/lib/pricing-settings'
import { prisma } from '@/lib/prisma'
import { buildSystemPrompt, type Language } from '@/lib/soul'

export interface SessionAiModel {
  id: string
  modelId: string
  provider: 'ANTHROPIC' | 'OPENAI' | 'GOOGLE'
  costPerMessage: number
  inputPricePer1M: number
  outputPricePer1M: number
  avgTokensPerMessage: number
  isActive: boolean
}

export interface SessionAiConfig {
  sessionId: string
  userId: string
  soul: {
    id: string
    name: string
    language: string
    systemPrompt: string | null
  } | null
  model: SessionAiModel | null
  pricing: { usdRate: number; pricePerToken: number }
}

/** Return null kalau session tidak ditemukan (caller HTTP memetakan ke 404). */
export async function getSessionAiConfig(
  sessionId: string,
): Promise<SessionAiConfig | null> {
  const wa = await prisma.whatsappSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      userId: true,
      soul: true,
      model: {
        select: {
          id: true,
          modelId: true,
          provider: true,
          costPerMessage: true,
          inputPricePer1M: true,
          outputPricePer1M: true,
          avgTokensPerMessage: true,
          isActive: true,
        },
      },
    },
  })
  if (!wa) return null

  // Bangun system prompt dari config soul (kalau ada).
  const systemPrompt = wa.soul
    ? await buildSystemPrompt({
        name: wa.soul.name,
        personality: wa.soul.personality,
        language: (wa.soul.language || 'id') as Language,
        replyStyle: wa.soul.replyStyle,
        businessContext: wa.soul.businessContext,
      })
    : null

  // Pricing snapshot supaya caller bisa hitung apiCostRp/revenueRp/profitRp
  // tanpa query tambahan.
  const pricing = await getPricingSettings()

  return {
    sessionId: wa.id,
    userId: wa.userId,
    soul: wa.soul
      ? {
          id: wa.soul.id,
          name: wa.soul.name,
          language: wa.soul.language,
          systemPrompt,
        }
      : null,
    model: wa.model,
    pricing: { usdRate: pricing.usdRate, pricePerToken: pricing.pricePerToken },
  }
}
