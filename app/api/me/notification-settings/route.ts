// GET  /api/me/notification-settings — return setting popup user.
// PATCH /api/me/notification-settings — update enabled / sound preset.
//
// Per-user setting (User.dashboardOrderPopup*) supaya tiap seller bisa
// pilih nada notif sendiri tanpa affecting seller lain.
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

const SOUND_VALUES = ['bell', 'ding', 'chime', 'pop', 'off'] as const

const updateSchema = z.object({
  dashboardOrderPopupEnabled: z.boolean().optional(),
  dashboardOrderPopupSound: z.enum(SOUND_VALUES).optional(),
})

export async function GET() {
  try {
    await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const session = await requireSession()
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      dashboardOrderPopupEnabled: true,
      dashboardOrderPopupSound: true,
    },
  })
  if (!user) return jsonError('User tidak ditemukan', 404)
  return jsonOk(user)
}

export async function PATCH(req: Request) {
  try {
    await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const session = await requireSession()
  const parsed = updateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  try {
    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: parsed.data,
      select: {
        dashboardOrderPopupEnabled: true,
        dashboardOrderPopupSound: true,
      },
    })
    return jsonOk(updated)
  } catch (err) {
    console.error('[PATCH /api/me/notification-settings] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
