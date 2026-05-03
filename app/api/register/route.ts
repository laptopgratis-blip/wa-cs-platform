// POST /api/register — buat user baru + saldo token awal.
// Response selalu format { success, data?, error? } sesuai konvensi project.
import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { registerSchema } from '@/lib/validations/auth'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      return NextResponse.json(
        { success: false, error: first?.message ?? 'Data tidak valid' },
        { status: 400 },
      )
    }

    const { name, email, password } = parsed.data

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Email sudah terdaftar' },
        { status: 409 },
      )
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase()
    const role = adminEmail && email === adminEmail ? 'ADMIN' : 'USER'

    // User + TokenBalance dibuat bersamaan dalam satu transaksi DB.
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: passwordHash,
        role,
        tokenBalance: { create: { balance: 0 } },
      },
      select: { id: true, email: true, name: true, role: true },
    })

    return NextResponse.json({ success: true, data: user }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/register] gagal:', err)
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan server' },
      { status: 500 },
    )
  }
}
