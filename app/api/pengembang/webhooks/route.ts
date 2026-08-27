// GET  /api/pengembang/webhooks — daftar endpoint milik user
// POST /api/pengembang/webhooks — buat endpoint; SATU-SATUNYA tempat secret
// muncul (selain rotate). Jangan console.log body/respons di file ini.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { consumeRateLimit } from '@/lib/rate-limit-memory'
import { createWebhookEndpoint, listWebhookEndpoints } from '@/lib/services/webhooks/endpoints'
import { webhookEndpointCreateSchema } from '@/lib/validations/webhook-endpoint'

export const dynamic = 'force-dynamic'

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  try {
    return jsonOk({ endpoints: await listWebhookEndpoints(session.user.id) })
  } catch (err) {
    console.error('[webhooks] gagal ambil daftar:', err)
    return jsonError('Gagal memuat daftar endpoint', 500)
  }
}

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  // 15 percobaan/jam (gagal ikut dihitung) — pola sama dengan pembuatan kunci API.
  const rate = consumeRateLimit({
    key: `webhook-create:${session.user.id}`,
    limit: 15,
    windowMs: 60 * 60 * 1000,
  })
  if (!rate.allowed) {
    const menit = Math.max(1, Math.ceil(rate.retryAfterMs / 60_000))
    return jsonError(`Terlalu banyak percobaan. Coba lagi dalam ${menit} menit.`, 429)
  }

  try {
    const body = await req.json().catch(() => null)
    const parsed = webhookEndpointCreateSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
    }
    const res = await createWebhookEndpoint({
      userId: session.user.id,
      url: parsed.data.url,
      description: parsed.data.description,
      events: parsed.data.events,
    })
    if (!res.ok) return jsonError(res.error)
    return jsonOk({ secret: res.secret, endpoint: res.endpoint }, 201)
  } catch (err) {
    console.error('[webhooks] gagal membuat endpoint:', err)
    return jsonError('Gagal membuat endpoint', 500)
  }
}
