// GET  /api/whatsapp/templates/starter-pack?sessionId= — status template
//      bawaan hulao (follow-up/INFO_GENERIC) di WABA sesi.
// POST /api/whatsapp/templates/starter-pack {sessionId, keys?} — buat + submit
//      yang belum ada (idempoten).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { autoLinkStarterFollowUps, ensureTemplatesByPurpose, getStarterPackStatus } from '@/lib/services/waba/starter-pack'
import { starterPackSchema } from '@/lib/validations/waba-template'

async function resolveWaba(sessionId: string, userId: string) {
  const s = await prisma.whatsappSession.findFirst({
    where: { id: sessionId, userId, provider: 'CLOUD_API' },
    select: { wabaId: true },
  })
  return s?.wabaId ?? null
}

export async function GET(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const sessionId = new URL(req.url).searchParams.get('sessionId') ?? ''
    if (!sessionId) return jsonError('sessionId wajib diisi', 400)
    const wabaId = await resolveWaba(sessionId, session.user.id)
    if (!wabaId) return jsonError('Sesi Cloud API tidak ditemukan', 404)
    return jsonOk({ items: await getStarterPackStatus(wabaId) })
  } catch (err) {
    console.error('[GET /api/whatsapp/templates/starter-pack] gagal:', err)
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
    const parsed = starterPackSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return jsonError('sessionId wajib diisi', 400)
    const wabaId = await resolveWaba(parsed.data.sessionId, session.user.id)
    if (!wabaId) return jsonError('Sesi Cloud API tidak ditemukan', 404)
    const r = await ensureTemplatesByPurpose({
      sessionId: parsed.data.sessionId,
      userId: session.user.id,
      keys: parsed.data.keys,
    })
    if (!r.ok) return jsonError(r.error ?? 'Gagal menyiapkan template', 400)
    // Auto-link ke follow-up default yang cocok (best-effort).
    const link = await autoLinkStarterFollowUps({ userId: session.user.id, wabaId }).catch(() => ({ linked: 0 }))
    return jsonOk({ results: r.results, linkedFollowUps: link.linked, items: await getStarterPackStatus(wabaId) })
  } catch (err) {
    console.error('[POST /api/whatsapp/templates/starter-pack] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
