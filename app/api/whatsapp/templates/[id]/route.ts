// GET    /api/whatsapp/templates/[id] — detail
// PATCH  /api/whatsapp/templates/[id] — ubah (DRAFT lokal; APPROVED/REJECTED/
//        PAUSED → dikirim ke Meta dan kembali PENDING)
// DELETE /api/whatsapp/templates/[id] — hapus di Meta + lokal (soft bila dirujuk)
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { deleteTemplate, updateTemplate } from '@/lib/services/waba/templates'
import { updateTemplateBodySchema } from '@/lib/validations/waba-template'

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
    const template = await prisma.wabaTemplate.findFirst({ where: { id, userId: session.user.id } })
    if (!template) return jsonError('Template tidak ditemukan', 404)
    return jsonOk({ template })
  } catch (err) {
    console.error('[GET /api/whatsapp/templates/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
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
    const parsed = updateTemplateBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues.map((i) => i.message).join('; '), 400)
    }
    const r = await updateTemplate({ templateId: id, userId: session.user.id, draft: parsed.data.draft })
    if (!r.ok) return jsonError(r.error ?? 'Gagal mengubah template', 400)
    return jsonOk({ template: r.template, warnings: r.warnings ?? [] })
  } catch (err) {
    console.error('[PATCH /api/whatsapp/templates/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
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
    const r = await deleteTemplate(id, session.user.id)
    if (!r.ok) return jsonError(r.error ?? 'Gagal menghapus template', 400)
    return jsonOk({ deleted: true, soft: r.soft ?? false })
  } catch (err) {
    console.error('[DELETE /api/whatsapp/templates/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
