// POST /api/pengembang/webhooks/[id]/rotate-secret — ganti secret HMAC.
// Secret baru hanya muncul di respons ini, sekali.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { rotateWebhookSecret } from '@/lib/services/webhooks/endpoints'

export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  try {
    const res = await rotateWebhookSecret({ userId: session.user.id, endpointId: id })
    if (!res.ok) return jsonError(res.error, 404)
    return jsonOk({ secret: res.secret })
  } catch (err) {
    console.error('[webhooks] rotate secret gagal:', err)
    return jsonError('Gagal mengganti secret', 500)
  }
}
