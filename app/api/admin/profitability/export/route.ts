// GET /api/admin/profitability/export?from=&to=
// Return data per pesan dalam range sebagai CSV. Header pakai semicolon
// supaya Excel ID buka langsung tanpa import wizard.
import type { NextResponse } from 'next/server'

import { jsonError, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { parseRange } from '@/lib/profitability'

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
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

    const rows = await prisma.message.findMany({
      where: {
        role: 'AI',
        createdAt: { gte: from, lt: to },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        createdAt: true,
        apiInputTokens: true,
        apiOutputTokens: true,
        apiCostRp: true,
        tokensCharged: true,
        revenueRp: true,
        profitRp: true,
        waSession: { select: { user: { select: { email: true } }, model: { select: { name: true } } } },
      },
      take: 50_000,
    })

    const headers = [
      'id',
      'createdAt',
      'user',
      'model',
      'inputTokens',
      'outputTokens',
      'apiCostRp',
      'tokensCharged',
      'revenueRp',
      'profitRp',
    ]
    const lines: string[] = [headers.join(';')]
    for (const r of rows) {
      lines.push(
        [
          r.id,
          r.createdAt.toISOString(),
          r.waSession?.user?.email ?? '',
          r.waSession?.model?.name ?? '',
          r.apiInputTokens ?? '',
          r.apiOutputTokens ?? '',
          r.apiCostRp ?? '',
          r.tokensCharged ?? '',
          r.revenueRp ?? '',
          r.profitRp ?? '',
        ]
          .map(csvCell)
          .join(';'),
      )
    }
    const csv = lines.join('\n')
    const filename = `profitability_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.csv`
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('[GET /api/admin/profitability/export] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
