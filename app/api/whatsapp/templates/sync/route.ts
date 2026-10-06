// POST /api/whatsapp/templates/sync {sessionId} — tarik template dari Meta
// (upsert by wabaId+name+language; yang hilang → DELETED).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { relinkStaleFollowUpTemplatesSafe } from '@/lib/services/followup-meta-relink'
import { syncTemplatesFromMeta } from '@/lib/services/waba/templates-sync'
import { templateSyncSchema } from '@/lib/validations/waba-template'

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const parsed = templateSyncSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return jsonError('sessionId wajib diisi', 400)
    const s = await prisma.whatsappSession.findFirst({
      where: { id: parsed.data.sessionId, userId: session.user.id, provider: 'CLOUD_API' },
      select: { wabaId: true },
    })
    if (!s?.wabaId) return jsonError('Sesi Cloud API tidak ditemukan', 404)
    const r = await syncTemplatesFromMeta({ wabaId: s.wabaId, userId: session.user.id })
    if (!r.ok) return jsonError(r.error ?? 'Sinkronisasi gagal', 400)
    // Template baru/berubah status → tautkan ulang follow-up yang basi (best-effort).
    const relinkedFollowUps = await relinkStaleFollowUpTemplatesSafe(session.user.id, 'templates/sync')
    return jsonOk({ ...r, relinkedFollowUps })
  } catch (err) {
    console.error('[POST /api/whatsapp/templates/sync] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
