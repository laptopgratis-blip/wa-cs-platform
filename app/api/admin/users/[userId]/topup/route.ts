// POST /api/admin/users/[userId]/topup — admin top-up manual.
// Body: { amount: int positive, description?: string }
// Buat TokenTransaction type=BONUS atau ADJUSTMENT (pakai BONUS untuk MVP).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { userTopupSchema } from '@/lib/validations/admin'

interface Params {
  params: Promise<{ userId: string }>
}

export async function POST(req: Request, { params }: Params) {
  let admin
  try {
    admin = await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const { userId } = await params
  const parsed = userTopupSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }

  try {
    const target = await prisma.user.findUnique({ where: { id: userId } })
    if (!target) return jsonError('User tidak ditemukan', 404)

    const result = await prisma.$transaction(async (tx) => {
      await tx.tokenBalance.upsert({
        where: { userId },
        create: {
          userId,
          balance: parsed.data.amount,
          totalPurchased: parsed.data.amount,
        },
        update: {
          balance: { increment: parsed.data.amount },
          totalPurchased: { increment: parsed.data.amount },
        },
      })
      await tx.tokenTransaction.create({
        data: {
          userId,
          amount: parsed.data.amount,
          type: 'BONUS',
          description:
            parsed.data.description ??
            `Top-up manual oleh admin (${admin.user.email ?? admin.user.id})`,
        },
      })
      return tx.tokenBalance.findUnique({ where: { userId } })
    })

    return jsonOk({
      userId,
      balance: result?.balance ?? 0,
      added: parsed.data.amount,
    })
  } catch (err) {
    console.error('[POST /api/admin/users/:id/topup] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
