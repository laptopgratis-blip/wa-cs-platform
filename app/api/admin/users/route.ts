// GET /api/admin/users?search=
// List user dengan saldo token + jumlah WA session.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const url = new URL(req.url)
  const search = (url.searchParams.get('search') ?? '').trim()

  const where: Record<string, unknown> = {}
  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { name: { contains: search, mode: 'insensitive' } },
    ]
  }

  try {
    const users = await prisma.user.findMany({
      where: where as never,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        tokenBalance: { select: { balance: true, totalUsed: true, totalPurchased: true } },
        _count: { select: { waSessions: true, contacts: true } },
      },
    })
    return jsonOk(
      users.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
      })),
    )
  } catch (err) {
    console.error('[GET /api/admin/users] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
