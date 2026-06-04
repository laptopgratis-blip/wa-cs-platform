// POST /api/content/post-publish/[lpId]/unlock
// Generate 12 WA Status sisa (charge token user). Idempotent — kalau partial,
// resume dari piece terakhir.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { generatePostPublishUnlock } from '@/lib/services/post-publish-content'

export async function POST(
  _req: Request,
  context: { params: Promise<{ lpId: string }> },
) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { lpId } = await context.params

  try {
    const result = await generatePostPublishUnlock({
      userId: session.user.id,
      lpId,
    })

    if (result.error === 'LP_NOT_FOUND') {
      return jsonError('LP tidak ditemukan', 404)
    }
    if (result.error === 'BRIEF_NOT_FOUND') {
      return jsonError(
        'Sample belum di-generate. Mulai dari /start dulu.',
        409,
      )
    }
    if (result.error === 'INSUFFICIENT_BALANCE') {
      return Response.json(
        {
          success: false,
          error: 'INSUFFICIENT_BALANCE',
          message: `Saldo token tidak cukup. Butuh ±${result.tokensRequired} token per status. Top-up dulu untuk lanjut.`,
          tokensRequired: result.tokensRequired ?? 0,
        },
        { status: 402 },
      )
    }

    return jsonOk({
      state: result.state,
      generatedCount: result.generatedCount,
      totalTokensCharged: result.totalTokensCharged,
    })
  } catch (err) {
    console.error('[POST /api/content/post-publish/[lpId]/unlock] gagal:', err)
    return jsonError('Gagal generate 12 status. Coba lagi nanti.', 500)
  }
}
