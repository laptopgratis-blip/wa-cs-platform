// POST /api/host-templates/orchestrate
// Shared admin + user: Claude generate prompt host (image + video) dari opsi
// terstruktur user. Pre-flight token charge (CS_REPLY-style) — kecil.
//
// Body: OrchestrateInput (lihat lib/services/host-gen/orchestrator.ts)
// Return: { promptImage, promptVideo, suggestedName, visualStyle,
//           suggestedGreeting, productImageUrls }
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { InsufficientBalanceError } from '@/lib/services/ai-generation-log'
import { orchestrateHostPrompt } from '@/lib/services/host-gen/orchestrator'

const schema = z.object({
  gender: z.enum(['female', 'male']),
  ageRange: z.enum(['young', 'adult', 'mature']),
  outfit: z.enum([
    'hijab_casual',
    'hijab_formal',
    'non_hijab_casual',
    'non_hijab_formal',
    'tshirt_jeans',
  ]),
  vibe: z.enum(['friendly', 'professional', 'energetic', 'calm']),
  background: z.enum([
    'studio_white',
    'studio_warm',
    'retail_shop',
    'home_cozy',
    'outdoor_bright',
    'gradient_soft',
  ]),
  motionIntensity: z.enum(['subtle', 'moderate', 'energetic']),
  artStyle: z.enum([
    'photoreal_natural',
    'photoreal_cinematic',
    'pixar_3d',
    'realistic_3d',
    'anime_modern',
    'painterly',
    'ghibli',
  ]),
  productIds: z.array(z.string()).max(8).optional(),
  extraNote: z.string().trim().max(300).optional(),
  // Sprint 5: Klip Live preset IDs
  visualHookPresetId: z.string().cuid().nullable().optional(),
  backgroundPresetId: z.string().cuid().nullable().optional(),
  // Sprint 5+: HostMode trigger different motion baseline strategy
  hostMode: z.enum(['TTS_GENERATIVE', 'NATIVE_LIBRARY']).optional(),
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
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid', 400)
  }

  try {
    const result = await orchestrateHostPrompt({
      userId: session.user.id,
      ...parsed.data,
    })
    return jsonOk(result)
  } catch (err) {
    if (err instanceof InsufficientBalanceError) {
      return jsonError(
        `Saldo token kurang. Butuh ±${err.tokensRequired} token.`,
        402,
      )
    }
    // Log full stack for debugging — bukan kirim ke client
    console.error('[orchestrate route] error:', err)
    return jsonError(
      `Orchestrator gagal: ${(err as Error).message.slice(0, 300)}`,
      500,
    )
  }
}
