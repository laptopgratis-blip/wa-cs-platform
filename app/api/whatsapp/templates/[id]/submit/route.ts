// POST /api/whatsapp/templates/[id]/submit — kirim draft ke Meta untuk review.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { submitTemplate } from '@/lib/services/waba/templates'

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
    const r = await submitTemplate(id, session.user.id)
    if (!r.ok) return jsonError(r.error ?? 'Gagal submit template', 400)
    return jsonOk({ template: r.template, warnings: r.warnings ?? [] })
  } catch (err) {
    console.error('[POST /api/whatsapp/templates/:id/submit] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
