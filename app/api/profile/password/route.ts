// POST /api/profile/password — ganti/set password user login.
// - User dengan password existing: WAJIB kirim currentPassword yang cocok.
// - User Google/OTP-only (password null): boleh set password pertama
//   langsung (sudah terautentikasi via session).
// Keputusan "wajib password lama" diambil dari DB, BUKAN dari input client.
import bcrypt from 'bcryptjs'
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, recordRateLimitHit } from '@/lib/rate-limit-memory'
import { changePasswordSchema } from '@/lib/validations/profile'

// Guard brute-force password lama: 5 percobaan salah per 15 menit per user.
const PWD_ATTEMPT_LIMIT = 5
const PWD_ATTEMPT_WINDOW_MS = 15 * 60 * 1000

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const body = await req.json().catch(() => null)
    const parsed = changePasswordSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { password: true },
    })
    if (!user) return jsonError('User tidak ditemukan', 404)

    if (user.password) {
      if (!parsed.data.currentPassword) {
        return jsonError('Password saat ini wajib diisi')
      }
      // Rate limit percobaan password salah — session yang dicuri tidak bisa
      // brute-force password lama tanpa batas.
      const rateKey = `pwd-verify:${session.user.id}`
      const rate = checkRateLimit({
        key: rateKey,
        limit: PWD_ATTEMPT_LIMIT,
        windowMs: PWD_ATTEMPT_WINDOW_MS,
      })
      if (!rate.allowed) {
        const menit = Math.max(1, Math.ceil(rate.retryAfterMs / 60_000))
        return jsonError(
          `Terlalu banyak percobaan password salah. Coba lagi dalam ${menit} menit.`,
          429,
        )
      }
      const ok = await bcrypt.compare(parsed.data.currentPassword, user.password)
      if (!ok) {
        recordRateLimitHit({ key: rateKey, windowMs: PWD_ATTEMPT_WINDOW_MS })
        return jsonError('Password saat ini salah')
      }
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10)
    await prisma.user.update({
      where: { id: session.user.id },
      data: { password: passwordHash },
    })

    return jsonOk({
      message: user.password
        ? 'Password berhasil diubah'
        : 'Password berhasil dibuat — sekarang kamu juga bisa login pakai email & password',
    })
  } catch (err) {
    console.error('[POST /api/profile/password] gagal:', err)
    return jsonError('Gagal mengubah password', 500)
  }
}
