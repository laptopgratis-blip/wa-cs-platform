// GET /api/admin/ai-pricing/logs — 5 log terbaru untuk Section D.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const rows = await prisma.pricingResearchLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: 5,
    })
    const data = rows.map((r) => ({
      id: r.id,
      triggeredBy: r.triggeredBy,
      status: r.status,
      modelsAdded: r.modelsAdded,
      modelsUpdated: r.modelsUpdated,
      error: r.error,
      startedAt: r.startedAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
    }))
    return jsonOk(data)
  } catch (err) {
    console.error('[GET /api/admin/ai-pricing/logs] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
