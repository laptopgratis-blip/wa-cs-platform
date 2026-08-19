// POST /api/whatsapp/waba/register  { sessionId, pin }
// Ulangi register nomor (jalur standar) dengan PIN dari user — dipakai saat
// onboarding gagal 133005 (PIN salah) tanpa harus mengulang wizard Meta.
import type { NextResponse } from 'next/server'

import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { decrypt } from '@/lib/crypto'
import { prisma } from '@/lib/prisma'
import { storeSessionPin } from '@/lib/services/waba/pin'
import { registerPhoneNumber } from '@/lib/services/waba/resources'

const bodySchema = z.object({
  sessionId: z.string().min(1),
  pin: z.string().regex(/^\d{6}$/, 'PIN harus 6 digit angka'),
})

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }

  try {
    const wa = await prisma.whatsappSession.findFirst({
      where: { id: parsed.data.sessionId, userId: session.user.id, provider: 'CLOUD_API' },
      select: { id: true, phoneNumberId: true, wabaTokenEnc: true, isCoexistence: true },
    })
    if (!wa) return jsonError('Sesi tidak ditemukan', 404)
    if (wa.isCoexistence) return jsonError('Nomor coexistence tidak perlu register', 400)
    if (!wa.phoneNumberId || !wa.wabaTokenEnc) {
      return jsonError('Sesi belum punya kredensial lengkap — hubungkan ulang', 400)
    }

    let token: string
    try {
      token = decrypt(wa.wabaTokenEnc)
    } catch {
      return jsonError('Token tidak bisa didekripsi — hubungkan ulang nomor', 400)
    }

    const reg = await registerPhoneNumber(wa.phoneNumberId, token, parsed.data.pin)
    if (!reg.ok) return jsonError(reg.error, 400)

    await storeSessionPin(wa.id, parsed.data.pin, false)
    await prisma.whatsappSession.update({
      where: { id: wa.id },
      data: { status: 'CONNECTED', lastError: null },
    })
    return jsonOk({ sessionId: wa.id, registered: true })
  } catch (err) {
    console.error('[POST /api/whatsapp/waba/register] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
