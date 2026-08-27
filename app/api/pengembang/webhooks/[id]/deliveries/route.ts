// GET /api/pengembang/webhooks/[id]/deliveries — 20 pengiriman terakhir.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { listDeliveries } from '@/lib/services/webhooks/endpoints'

export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  try {
    const rows = await listDeliveries({ userId: session.user.id, endpointId: id })
    if (rows === null) return jsonError('Endpoint tidak ditemukan', 404)
    return jsonOk({ deliveries: rows })
  } catch (err) {
    console.error('[webhooks] gagal ambil riwayat:', err)
    return jsonError('Gagal memuat riwayat', 500)
  }
}
