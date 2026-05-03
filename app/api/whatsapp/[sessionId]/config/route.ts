// PATCH /api/whatsapp/[sessionId]/config
// Update soulId & modelId untuk WA session ini.
// soulId/modelId boleh null (lepas konfigurasi).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { sessionConfigSchema } from '@/lib/validations/soul'

interface Params {
  params: Promise<{ sessionId: string }>
}

export async function PATCH(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const { sessionId } = await params
  const json = await req.json().catch(() => null)
  const parsed = sessionConfigSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }

  try {
    // Pastikan session milik user.
    const wa = await prisma.whatsappSession.findFirst({
      where: { id: sessionId, userId: session.user.id },
      select: { id: true },
    })
    if (!wa) return jsonError('Session tidak ditemukan', 404)

    // Validasi soul/model milik user / aktif.
    if (parsed.data.soulId) {
      const soul = await prisma.soul.findFirst({
        where: { id: parsed.data.soulId, userId: session.user.id },
        select: { id: true },
      })
      if (!soul) return jsonError('Soul tidak ditemukan', 404)
    }
    if (parsed.data.modelId) {
      const model = await prisma.aiModel.findFirst({
        where: { id: parsed.data.modelId, isActive: true },
        select: { id: true },
      })
      if (!model) return jsonError('Model AI tidak tersedia', 404)
    }

    const updated = await prisma.whatsappSession.update({
      where: { id: sessionId },
      data: {
        soulId: parsed.data.soulId === undefined ? undefined : parsed.data.soulId,
        modelId: parsed.data.modelId === undefined ? undefined : parsed.data.modelId,
      },
      select: { id: true, soulId: true, modelId: true },
    })

    return jsonOk(updated)
  } catch (err) {
    console.error('[PATCH /api/whatsapp/:id/config] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
