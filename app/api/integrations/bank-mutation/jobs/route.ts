// GET /api/integrations/bank-mutation/jobs — list scrape job log untuk debug.
// Hanya 50 job terakhir milik integrasi user.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'

export async function GET() {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }

  try {
    const integration = await prisma.bankMutationIntegration.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!integration) return jsonOk({ jobs: [] })

    const jobs = await prisma.bankScrapeJob.findMany({
      where: { integrationId: integration.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return jsonOk({
      jobs: jobs.map((j) => ({
        ...j,
        startedAt: j.startedAt?.toISOString() ?? null,
        completedAt: j.completedAt?.toISOString() ?? null,
        createdAt: j.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    console.error('[GET .../bank-mutation/jobs]', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
