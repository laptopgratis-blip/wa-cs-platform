// PATCH  /api/pengembang/webhooks/[id] — ubah url/deskripsi/events/aktif
// DELETE /api/pengembang/webhooks/[id] — hapus permanen (delivery ikut cascade)
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { consumeRateLimit } from '@/lib/rate-limit-memory'
import {
  deleteWebhookEndpoint,
  updateWebhookEndpoint,
} from '@/lib/services/webhooks/endpoints'
import { webhookEndpointUpdateSchema } from '@/lib/validations/webhook-endpoint'

export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ id: string }>
}

export async function PATCH(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params

  // PATCH url memicu resolve DNS (assertSafeWebhookUrl) → tanpa batas, ini
  // jadi oracle probe DNS/SSRF sekali per request. 30/jam per user cukup untuk
  // pemakaian wajar, jauh dari kecepatan probing.
  const rate = consumeRateLimit({
    key: `webhook-update:${session.user.id}`,
    limit: 30,
    windowMs: 60 * 60 * 1000,
  })
  if (!rate.allowed) {
    const menit = Math.max(1, Math.ceil(rate.retryAfterMs / 60_000))
    return jsonError(
      `Terlalu banyak perubahan. Coba lagi dalam ${menit} menit.`,
      429,
    )
  }

  try {
    const body = await req.json().catch(() => null)
    const parsed = webhookEndpointUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
    }
    const res = await updateWebhookEndpoint({
      userId: session.user.id,
      endpointId: id,
      ...parsed.data,
    })
    if (!res.ok) return jsonError(res.error, res.notFound ? 404 : 400)
    return jsonOk({ endpoint: res.endpoint })
  } catch (err) {
    console.error('[webhooks] gagal update endpoint:', err)
    return jsonError('Gagal menyimpan endpoint', 500)
  }
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
    const deleted = await deleteWebhookEndpoint({
      userId: session.user.id,
      endpointId: id,
    })
    if (!deleted) return jsonError('Endpoint tidak ditemukan', 404)
    return jsonOk({ deleted: true })
  } catch (err) {
    console.error('[webhooks] gagal hapus endpoint:', err)
    return jsonError('Gagal menghapus endpoint', 500)
  }
}
