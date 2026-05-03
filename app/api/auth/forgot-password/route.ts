// POST /api/auth/forgot-password — kirim email reset password.
// Selalu return sukses meski email tidak terdaftar (anti email enumeration).
import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'

import { sendPasswordResetEmail } from '@/lib/email'
import { prisma } from '@/lib/prisma'
import { forgotPasswordSchema } from '@/lib/validations/auth'

const TOKEN_TTL_MINUTES = 15

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = forgotPasswordSchema.safeParse(body)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      return NextResponse.json(
        { success: false, error: first?.message ?? 'Data tidak valid' },
        { status: 400 },
      )
    }

    const { email } = parsed.data

    const user = await prisma.user.findUnique({ where: { email } })

    // Hanya kirim email kalau user ada DAN punya password (bukan akun Google-only).
    // Tapi response selalu sama supaya tidak bocorkan apakah email terdaftar.
    if (user?.password) {
      const token = randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000)

      await prisma.passwordResetToken.create({
        data: { email, token, expiresAt },
      })

      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
      const resetUrl = `${baseUrl}/reset-password?token=${token}`

      try {
        await sendPasswordResetEmail(email, resetUrl)
      } catch (mailErr) {
        // Log tapi jangan bocor ke client. User tetap dapat respons sukses.
        console.error('[POST /api/auth/forgot-password] gagal kirim email:', mailErr)
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        message:
          'Jika email terdaftar, link reset password sudah dikirim. Cek inbox kamu.',
      },
    })
  } catch (err) {
    console.error('[POST /api/auth/forgot-password] gagal:', err)
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan server' },
      { status: 500 },
    )
  }
}
