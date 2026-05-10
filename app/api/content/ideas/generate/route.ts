// POST /api/content/ideas/generate
// Body: { lpId?: string, manualTitle?, manualAudience?, manualOffer? }
// Response: { ideas: [...15], charge, status }
//
// Flow:
//   - Auth user
//   - Run idea generator (3 metode parallel)
//   - Persist 15 ContentIdea rows
//   - Return ideas dengan id + isFreePreview flag
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import {
  generateIdeas,
  persistIdeas,
} from '@/lib/services/content/idea-generator'

const schema = z.object({
  lpId: z.string().optional(),
  manualTitle: z.string().max(200).optional(),
  manualAudience: z.string().max(2000).optional(),
  manualOffer: z.string().max(2000).optional(),
})

export const maxDuration = 120

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError('Body tidak valid')

  // Validasi: minimal lpId atau manualTitle wajib salah satu.
  if (!parsed.data.lpId && !parsed.data.manualTitle) {
    return jsonError('Pilih LP atau isi judul produk manual.')
  }

  try {
    const result = await generateIdeas({
      userId: session.user.id,
      lpId: parsed.data.lpId,
      manualTitle: parsed.data.manualTitle,
      manualAudience: parsed.data.manualAudience,
      manualOffer: parsed.data.manualOffer,
    })

    if (result.status === 'INSUFFICIENT_BALANCE') {
      return jsonError(
        `Saldo token kamu tidak cukup. Butuh ±${result.charge?.tokensCharged ?? 200} token. Top up dulu di /pricing.`,
        402,
      )
    }

    if (result.ideas.length === 0) {
      return jsonError(
        `AI gagal generate ide. Detail: ${result.methodResults
          .filter((r) => !r.ok)
          .map((r) => `${r.method}: ${r.error}`)
          .join('; ')}`,
        500,
      )
    }

    // Persist ke DB.
    const persisted = await persistIdeas({
      userId: session.user.id,
      lpId: parsed.data.lpId,
      ideas: result.ideas,
    })

    // Merge ID dari persist ke ide untuk display di UI.
    const ideasWithId = result.ideas.map((idea, i) => ({
      ...idea,
      id: persisted[i]?.id,
    }))

    return jsonOk({
      ideas: ideasWithId,
      tokensCharged: result.charge?.tokensCharged ?? 0,
      methodResults: result.methodResults,
    })
  } catch (err) {
    console.error('[POST /api/content/ideas/generate]', err)
    return jsonError(
      err instanceof Error ? err.message : 'Gagal generate ide',
      500,
    )
  }
}
