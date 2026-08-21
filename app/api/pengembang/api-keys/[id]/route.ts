// DELETE /api/pengembang/api-keys/[id] — cabut kunci (soft revoke).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { revokeSellerApiKey } from '@/lib/services/seller-api-keys'

export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ id: string }>
}

export async function DELETE(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const { id } = await params
  try {
    // Service memfilter by userId — kunci milik orang lain tidak akan pernah
    // tercabut dari sini.
    const revoked = await revokeSellerApiKey({ userId: session.user.id, keyId: id })
    if (!revoked) return jsonError('Kunci tidak ditemukan atau sudah dicabut', 404)
    return jsonOk({ revoked: true })
  } catch (err) {
    console.error('[api-keys] gagal mencabut kunci:', err)
    return jsonError('Gagal mencabut kunci API', 500)
  }
}
