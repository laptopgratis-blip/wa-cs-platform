// GET  /api/admin/platform-templates?sessionId= — status template PLATFORM
//      (AUTH_OTP + INFO_GENERIC) di WABA sesi Cloud API (biasanya milik admin).
// POST /api/admin/platform-templates {sessionId} — buat + submit yang belum
//      ada (idempoten). Dipakai OtpWaSenderPicker saat sender OTP = sesi cloud.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import {
  PLATFORM_TEMPLATES,
  ensureTemplatesByPurpose,
  getStarterPackStatus,
} from '@/lib/services/waba/starter-pack'

const bodySchema = z.object({ sessionId: z.string().trim().min(1) })

async function resolveSession(sessionId: string) {
  // Admin boleh menyiapkan template platform di sesi cloud siapa pun yang
  // dipakai sebagai pengirim OTP (umumnya milik admin sendiri).
  return prisma.whatsappSession.findFirst({
    where: { id: sessionId, provider: 'CLOUD_API', wabaId: { not: null } },
    select: { id: true, userId: true, wabaId: true },
  })
}

export async function GET(req: Request) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const sessionId = new URL(req.url).searchParams.get('sessionId') ?? ''
    if (!sessionId) return jsonError('sessionId wajib diisi', 400)
    const s = await resolveSession(sessionId)
    if (!s?.wabaId) return jsonError('Sesi Cloud API tidak ditemukan', 404)
    return jsonOk({ items: await getStarterPackStatus(s.wabaId, PLATFORM_TEMPLATES) })
  } catch (err) {
    console.error('[GET /api/admin/platform-templates] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return jsonError('sessionId wajib diisi', 400)
    const s = await resolveSession(parsed.data.sessionId)
    if (!s?.wabaId) return jsonError('Sesi Cloud API tidak ditemukan', 404)
    const r = await ensureTemplatesByPurpose({
      sessionId: s.id,
      userId: s.userId,
      pool: PLATFORM_TEMPLATES,
    })
    if (!r.ok) return jsonError(r.error ?? 'Gagal menyiapkan template platform', 400)
    return jsonOk({ results: r.results, items: await getStarterPackStatus(s.wabaId, PLATFORM_TEMPLATES) })
  } catch (err) {
    console.error('[POST /api/admin/platform-templates] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
