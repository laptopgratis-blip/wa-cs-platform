// GET  /api/whatsapp/templates?sessionId=&status= — daftar template Meta
//      untuk WABA sesi (atau semua WABA user bila sessionId kosong).
// POST /api/whatsapp/templates[?submit=1] — buat draft (opsional langsung
//      submit ke Meta).
import type { NextResponse } from 'next/server'
import type { MetaTemplateStatus } from '@prisma/client'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import {
  createTemplateDraft,
  listCloudSessionsForUser,
  listTemplatesForUser,
  submitTemplate,
} from '@/lib/services/waba/templates'
import { createTemplateBodySchema } from '@/lib/validations/waba-template'

const STATUSES: MetaTemplateStatus[] = [
  'DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED', 'IN_APPEAL', 'LIMIT_EXCEEDED', 'DELETED',
]

export async function GET(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const url = new URL(req.url)
    const sessionId = url.searchParams.get('sessionId')
    const statusRaw = url.searchParams.get('status') as MetaTemplateStatus | null
    const status = statusRaw && STATUSES.includes(statusRaw) ? statusRaw : undefined

    let wabaId: string | undefined
    if (sessionId) {
      const s = await prisma.whatsappSession.findFirst({
        where: { id: sessionId, userId: session.user.id, provider: 'CLOUD_API' },
        select: { wabaId: true },
      })
      if (!s?.wabaId) return jsonError('Sesi Cloud API tidak ditemukan', 404)
      wabaId = s.wabaId
    }
    const [templates, sessions] = await Promise.all([
      listTemplatesForUser(session.user.id, { wabaId, status }),
      listCloudSessionsForUser(session.user.id),
    ])
    return jsonOk({ templates, sessions })
  } catch (err) {
    console.error('[GET /api/whatsapp/templates] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const body = await req.json().catch(() => null)
    const parsed = createTemplateBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues.map((i) => i.message).join('; '), 400)
    }
    const submit = new URL(req.url).searchParams.get('submit') === '1'

    const created = await createTemplateDraft({
      userId: session.user.id,
      sessionId: parsed.data.sessionId,
      draft: parsed.data.draft,
    })
    if (!created.ok || !created.template) return jsonError(created.error ?? 'Gagal menyimpan draft', 400)

    if (!submit) return jsonOk({ template: created.template, warnings: created.warnings ?? [] }, 201)

    const sub = await submitTemplate(created.template.id, session.user.id)
    if (!sub.ok) {
      // Draft tetap tersimpan — UI menampilkan error Meta dan user bisa perbaiki.
      return jsonOk(
        { template: created.template, warnings: created.warnings ?? [], submitError: sub.error },
        201,
      )
    }
    return jsonOk({ template: sub.template, warnings: created.warnings ?? [] }, 201)
  } catch (err) {
    console.error('[POST /api/whatsapp/templates] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
