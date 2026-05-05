// POST /api/admin/ai-pricing/research
// Trigger AI research async. Return job ID langsung; client polling status
// lewat GET /api/admin/ai-pricing/research/[id].
//
// Catatan eksekusi: research butuh ~30-60 detik (web_search). Karena nextjs
// jalan di server long-running (bukan serverless), Promise tanpa await
// tetap dieksekusi sampai selesai.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { runResearch } from '@/lib/services/ai-pricing-research'

export async function POST() {
  let session
  try {
    session = await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }

  const log = await prisma.pricingResearchLog.create({
    data: {
      triggeredBy: session.user.id,
      status: 'RUNNING',
    },
  })

  // Fire-and-forget — runResearch akan update log status sendiri.
  void runResearch(log.id).catch((err) =>
    console.error('[ai-pricing/research] background error:', err),
  )

  return jsonOk({ jobId: log.id, status: 'RUNNING' })
}
