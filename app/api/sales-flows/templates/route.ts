// GET /api/sales-flows/templates
// Pre-built templates yang user bisa pilih saat buat flow baru. Dipakai
// halaman /cara-jualan untuk render daftar template card.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { SALES_FLOW_TEMPLATES } from '@/lib/sales-flow-templates'

export async function GET() {
  try {
    await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  try {
    return jsonOk({ templates: SALES_FLOW_TEMPLATES })
  } catch (err) {
    console.error('[GET /api/sales-flows/templates] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
