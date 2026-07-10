// GET /api/profile — info akun user login (tanpa hash password).
// PATCH /api/profile — update nama.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { updateProfileSchema } from '@/lib/validations/profile'

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        email: true,
        image: true,
        phoneNumber: true,
        emailVerified: true,
        phoneVerified: true,
        createdAt: true,
        password: true,
      },
    })
    if (!user) return jsonError('User tidak ditemukan', 404)
    const { password, ...rest } = user
    // hasPassword dipakai UI untuk memutuskan tampil field "password lama".
    // Hash-nya sendiri JANGAN pernah dikirim ke client.
    return jsonOk({ ...rest, hasPassword: Boolean(password) })
  } catch (err) {
    console.error('[GET /api/profile] gagal:', err)
    return jsonError('Gagal memuat profil', 500)
  }
}

export async function PATCH(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const body = await req.json().catch(() => null)
    const parsed = updateProfileSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
    }
    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: { name: parsed.data.name },
      select: { id: true, name: true },
    })
    return jsonOk(updated)
  } catch (err) {
    console.error('[PATCH /api/profile] gagal:', err)
    return jsonError('Gagal menyimpan profil', 500)
  }
}
