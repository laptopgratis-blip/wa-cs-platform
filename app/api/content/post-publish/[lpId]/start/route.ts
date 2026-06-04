// POST /api/content/post-publish/[lpId]/start
// Generate 3 WA Status sample (Hulao tanggung biaya AI). Idempotent —
// kalau sudah ada, return state existing.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { generatePostPublishSamples } from '@/lib/services/post-publish-content'

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
    const result = await generatePostPublishSamples({
      userId: session.user.id,
      lpId,
    })
    if (result.error === 'LP_NOT_FOUND') {
      return jsonError('LP tidak ditemukan', 404)
    }
    return jsonOk({ state: result.state })
  } catch (err) {
    console.error('[POST /api/content/post-publish/[lpId]/start] gagal:', err)
    return jsonError('Gagal generate sample. Coba lagi nanti.', 500)
  }
}
