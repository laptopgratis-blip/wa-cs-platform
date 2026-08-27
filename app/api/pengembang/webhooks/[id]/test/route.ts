// POST /api/pengembang/webhooks/[id]/test — kirim event `ping` sinkron dan
// balas hasilnya (status HTTP / error) untuk ditampilkan langsung di UI.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { checkRateLimit, recordRateLimitHit } from '@/lib/rate-limit-memory'
import { sendTestEvent } from '@/lib/services/webhooks/endpoints'

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

  // Uji = request keluar sungguhan; 10/menit per user cukup untuk debug
  // tanpa membuka pintu memakai kami sebagai meriam kecil.
  const rateKey = `webhook-test:${session.user.id}`
  const rate = checkRateLimit({ key: rateKey, limit: 10, windowMs: 60_000 })
  if (!rate.allowed) return jsonError('Terlalu sering. Tunggu sebentar lalu coba lagi.', 429)
  recordRateLimitHit({ key: rateKey, windowMs: 60_000 })

  try {
    const res = await sendTestEvent({ userId: session.user.id, endpointId: id })
    if ('notFound' in res) return jsonError(res.error, 404)
    return jsonOk(res)
  } catch (err) {
    console.error('[webhooks] uji kirim gagal:', err)
    return jsonError('Gagal mengirim uji', 500)
  }
}
