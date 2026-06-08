// GET /api/admin/token-cost/by-user?from=&to=
// Penggunaan AI per user (semua fitur, dari AiGenerationLog). Top 100 by biaya.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { parseRange } from '@/lib/profitability'
import { prisma } from '@/lib/prisma'

interface Row {
  userId: string
  email: string | null
  name: string | null
  calls: number
  tokensCharged: number
  apiCostRp: number
  revenueRp: number
  profitRp: number
}

export async function GET(req: Request) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const { searchParams } = new URL(req.url)
    const { from, to } = parseRange(searchParams)

    const rows = await prisma.$queryRaw<Row[]>`
      SELECT l."userId",
             u."email",
             u."name",
             COUNT(*)::int AS calls,
             COALESCE(SUM(l."tokensCharged"), 0)::int AS "tokensCharged",
             COALESCE(SUM(l."apiCostRp"), 0)::float8 AS "apiCostRp",
             COALESCE(SUM(l."revenueRp"), 0)::float8 AS "revenueRp",
             COALESCE(SUM(l."profitRp"), 0)::float8 AS "profitRp"
      FROM "AiGenerationLog" l
      JOIN "User" u ON u."id" = l."userId"
      WHERE l."createdAt" >= ${from} AND l."createdAt" < ${to}
      GROUP BY l."userId", u."email", u."name"
      ORDER BY "apiCostRp" DESC
      LIMIT 100`

    return jsonOk(rows)
  } catch (err) {
    console.error('[GET /api/admin/token-cost/by-user] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
