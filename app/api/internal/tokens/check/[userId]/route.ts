// GET /api/internal/tokens/check/[userId]
// Cek saldo token user. Dipakai wa-service sebelum trigger AI reply.
import { NextResponse } from 'next/server'

import { requireServiceSecret } from '@/lib/internal-auth'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ userId: string }>
}

export async function GET(req: Request, { params }: Params) {
  const blocked = requireServiceSecret(req)
  if (blocked) return blocked

  const { userId } = await params
  try {
    const balance = await prisma.tokenBalance.findUnique({
      where: { userId },
      select: { balance: true, totalUsed: true, totalPurchased: true },
    })
    return NextResponse.json({
      success: true,
      data: {
        userId,
        balance: balance?.balance ?? 0,
        totalUsed: balance?.totalUsed ?? 0,
        totalPurchased: balance?.totalPurchased ?? 0,
      },
    })
  } catch (err) {
    console.error('[GET /api/internal/tokens/check/:userId] gagal:', err)
    return NextResponse.json(
      { success: false, error: 'internal error' },
      { status: 500 },
    )
  }
}
