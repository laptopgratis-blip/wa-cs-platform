// POST /api/auth/reset-password — set password baru pakai token reset.
import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { resetPasswordSchema } from '@/lib/validations/auth'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = resetPasswordSchema.safeParse(body)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      return NextResponse.json(
        { success: false, error: first?.message ?? 'Data tidak valid' },
        { status: 400 },
      )
    }

    const { token, password } = parsed.data

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
    })

    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
      return NextResponse.json(
        { success: false, error: 'Link reset tidak valid atau sudah kedaluwarsa' },
        { status: 400 },
      )
    }

    const user = await prisma.user.findUnique({ where: { email: resetToken.email } })
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Akun tidak ditemukan' },
        { status: 404 },
      )
    }

    const passwordHash = await bcrypt.hash(password, 10)

    // Update password + tandai token sebagai used dalam satu transaksi DB.
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { password: passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      }),
    ])

    return NextResponse.json({
      success: true,
      data: { message: 'Password berhasil diubah. Silakan masuk dengan password baru.' },
    })
  } catch (err) {
    console.error('[POST /api/auth/reset-password] gagal:', err)
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan server' },
      { status: 500 },
    )
  }
}
