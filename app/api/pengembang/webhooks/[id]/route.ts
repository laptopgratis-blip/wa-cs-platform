// PATCH  /api/pengembang/webhooks/[id] — ubah url/deskripsi/events/aktif
// DELETE /api/pengembang/webhooks/[id] — hapus permanen (delivery ikut cascade)
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { deleteWebhookEndpoint, updateWebhookEndpoint } from '@/lib/services/webhooks/endpoints'
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
    const deleted = await deleteWebhookEndpoint({ userId: session.user.id, endpointId: id })
    if (!deleted) return jsonError('Endpoint tidak ditemukan', 404)
    return jsonOk({ deleted: true })
  } catch (err) {
    console.error('[webhooks] gagal hapus endpoint:', err)
    return jsonError('Gagal menghapus endpoint', 500)
  }
}
