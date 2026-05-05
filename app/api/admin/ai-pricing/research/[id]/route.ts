// GET /api/admin/ai-pricing/research/[id] — status job + diff hasil.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, { params }: Params) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  const log = await prisma.pricingResearchLog.findUnique({ where: { id } })
  if (!log) return jsonError('Job tidak ditemukan', 404)
  return jsonOk({
    id: log.id,
    status: log.status,
    modelsAdded: log.modelsAdded,
    modelsUpdated: log.modelsUpdated,
    diff: log.diff,
    error: log.error,
    startedAt: log.startedAt.toISOString(),
    completedAt: log.completedAt?.toISOString() ?? null,
  })
}
