// POST /api/whatsapp/waba/connect-manual
// Jalur "Token Manual": user memasukkan Access Token + WABA ID sendiri
// (developer / migrasi). Berbeda dari /exchange yang menukar kode OAuth —
// di sini token dipakai langsung. Reuse orkestrasi onboarding yang sama.
import { after, type NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { startCoexistenceSync } from '@/lib/services/waba/coexistence-sync'
import { completeManualToken } from '@/lib/services/waba/onboarding'

const bodySchema = z.object({
  accessToken: z.string().trim().min(20, 'Access token tidak valid').max(1000),
  wabaId: z
    .string()
    .trim()
    .regex(/^\d{5,20}$/, 'WABA ID harus berupa angka'),
  pin: z
    .string()
    .regex(/^\d{6}$/, 'PIN harus 6 digit angka')
    .optional(),
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
    const result = await completeManualToken({
      userId: session.user.id,
      accessToken: parsed.data.accessToken,
      wabaId: parsed.data.wabaId,
      pin: parsed.data.pin,
    })
    // 5xx diganti HTML oleh Cloudflare → paksa 4xx supaya pesan sampai.
    if (!result.ok) return jsonError(result.error, result.status === 500 ? 400 : result.status)

    if (result.data.syncScheduled) {
      const sessionId = result.data.sessionId
      after(async () => {
        try {
          await startCoexistenceSync(sessionId)
        } catch (err) {
          console.error('[waba/connect-manual] startCoexistenceSync gagal:', err)
        }
      })
    }
    return jsonOk(result.data)
  } catch (err) {
    console.error('[POST /api/whatsapp/waba/connect-manual] gagal:', err)
    return jsonError('Terjadi kesalahan server', 400)
  }
}
