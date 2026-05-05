// GET /api/admin/profitability/by-user?from=&to=
// Top users by usage.
import { Prisma } from '@prisma/client'
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { parseRange } from '@/lib/profitability'

interface RawRow {
  userId: string
  email: string
  name: string | null
  count: bigint
  apiCostRp: number | null
  revenueRp: number | null
  profitRp: number | null
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

    const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT
        u."id" AS "userId",
        u."email" AS "email",
        u."name" AS "name",
        COUNT(*)::bigint AS "count",
        SUM(msg."apiCostRp") AS "apiCostRp",
        SUM(msg."revenueRp") AS "revenueRp",
        SUM(msg."profitRp") AS "profitRp"
      FROM "Message" msg
      JOIN "WhatsappSession" ws ON msg."waSessionId" = ws."id"
      JOIN "User" u ON ws."userId" = u."id"
      WHERE msg."role" = 'AI' AND msg."createdAt" >= ${from} AND msg."createdAt" < ${to}
      GROUP BY u."id", u."email", u."name"
      ORDER BY COUNT(*) DESC
      LIMIT 50
    `)

    const data = rows.map((r) => ({
      userId: r.userId,
      email: r.email,
      name: r.name,
      messages: Number(r.count),
      apiCostRp: r.apiCostRp ?? 0,
      revenueRp: r.revenueRp ?? 0,
      profitRp: r.profitRp ?? 0,
    }))
    return jsonOk(data)
  } catch (err) {
    console.error('[GET /api/admin/profitability/by-user] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
