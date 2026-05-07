// GET /api/shipping/destinations?q=bandung
// Proxy ke RajaOngkir Komerce — tidak expose API key ke client.
// Plan-gate enforced: hanya user paket POWER yang boleh hit endpoint ini.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { searchDestinations } from '@/lib/services/rajaongkir'

export async function GET(req: Request) {
  try {
    await requireOrderSystemAccess()
  } catch (res) {
    return res as NextResponse
  }

  const url = new URL(req.url)
  const q = url.searchParams.get('q') ?? ''
  const limit = Math.min(20, Number(url.searchParams.get('limit') ?? 10))

  if (q.trim().length < 2) {
    return jsonOk({ items: [] })
  }

  try {
    const items = await searchDestinations(q, limit)
    return jsonOk({ items })
  } catch (err) {
    console.error('[GET /api/shipping/destinations] gagal:', err)
    return jsonError('Gagal cari alamat. Coba lagi sebentar.', 500)
  }
}
