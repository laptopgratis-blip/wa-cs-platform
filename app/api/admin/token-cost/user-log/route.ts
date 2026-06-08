// GET /api/admin/token-cost/user-log?userId=&from=&to=&page=
// Drill-down: log rinci tiap panggilan AI satu user (paginated).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { parseRange } from '@/lib/profitability'
import { prisma } from '@/lib/prisma'

const PAGE_SIZE = 30

export async function GET(req: Request) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const { searchParams } = new URL(req.url)
    const userId = (searchParams.get('userId') ?? '').trim()
    if (!userId) return jsonError('userId wajib', 400)
    const { from, to } = parseRange(searchParams)
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)

    const where = { userId, createdAt: { gte: from, lt: to } }
    const [total, rows, user] = await Promise.all([
      prisma.aiGenerationLog.count({ where }),
      prisma.aiGenerationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          featureKey: true,
          modelName: true,
          provider: true,
          inputTokens: true,
          outputTokens: true,
          tokensCharged: true,
          apiCostRp: true,
          revenueRp: true,
          profitRp: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      }),
    ])

    return jsonOk({
      user,
      total,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    })
  } catch (err) {
    console.error('[GET /api/admin/token-cost/user-log] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
