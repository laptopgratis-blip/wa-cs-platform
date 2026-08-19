// POST /api/whatsapp/waba/exchange
// Selesaikan Embedded Signup (jalur FB JS SDK): body {code, state, wabaId?,
// phoneNumberId?, pin?} dari AddWabaModal setelah FB.login. Validasi state +
// pemilik, lalu orkestrasi di lib/services/waba/onboarding. Bila sesi
// coexistence & webhook aktif → jadwalkan sync kontak/riwayat (after()).
import { after, type NextResponse } from 'next/server'

import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { startCoexistenceSync } from '@/lib/services/waba/coexistence-sync'
import { validateSignupState } from '@/lib/services/waba/oauth'
import { completeEmbeddedSignup } from '@/lib/services/waba/onboarding'

const bodySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  wabaId: z.string().min(1).optional(),
  phoneNumberId: z.string().min(1).optional(),
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
    // Anti-CSRF/token-planting: state harus dibuat oleh user yang sama
    // dengan yang sedang login sekarang.
    const state = validateSignupState(parsed.data.state)
    if (!state || state.userId !== session.user.id) {
      console.error('[waba/exchange] state invalid/kedaluwarsa untuk user', session.user.id)
      return jsonError('Sesi hubungkan kedaluwarsa — tutup dan ulangi proses hubungkan', 400)
    }

    const result = await completeEmbeddedSignup({
      userId: session.user.id,
      code: parsed.data.code,
      wabaId: parsed.data.wabaId,
      phoneNumberId: parsed.data.phoneNumberId,
      pin: parsed.data.pin,
    })
    // Status 4xx disengaja — Cloudflare mengganti body 5xx dari origin dengan
    // halaman HTML-nya sehingga pesan error tidak sampai ke user.
    if (!result.ok) return jsonError(result.error, result.status === 500 ? 400 : result.status)

    if (result.data.syncScheduled) {
      const sessionId = result.data.sessionId
      after(() => startCoexistenceSync(sessionId))
    }

    return jsonOk(result.data)
  } catch (err) {
    console.error('[POST /api/whatsapp/waba/exchange] gagal:', err)
    return jsonError('Terjadi kesalahan server saat menghubungkan nomor', 500)
  }
}
