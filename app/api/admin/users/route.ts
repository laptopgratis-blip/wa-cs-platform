// GET /api/admin/users?search=&page=1&pageSize=20
// List user dengan saldo token + jumlah WA session (paginated).
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
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'))
  const pageSize = Math.min(
    50,
    Math.max(1, Number(url.searchParams.get('pageSize') ?? '20')),
  )

  const where: Record<string, unknown> = {}
  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { name: { contains: search, mode: 'insensitive' } },
    ]
  }

  try {
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: where as never,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          tokenBalance: { select: { balance: true, totalUsed: true, totalPurchased: true } },
          _count: { select: { waSessions: true, contacts: true } },
        },
      }),
      prisma.user.count({ where: where as never }),
    ])
    return jsonOk({
      page,
      pageSize,
      total,
      users: users.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    console.error('[GET /api/admin/users] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
