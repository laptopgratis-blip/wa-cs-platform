// POST or GET /api/cron/ai-pricing-research
// Scheduled trigger (cron-job.org / Vercel Cron) — jalankan research +
// generate Alert kalau ada perubahan supaya admin tahu di sidebar bell.
//
// Auth: header `x-cron-secret` atau query `?secret=...` == CRON_SECRET.
// (cron-job.org gampang pakai query param.)
import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { runResearch } from '@/lib/services/ai-pricing-research'

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const url = new URL(req.url)
  const queryToken = url.searchParams.get('secret')
  const headerToken = req.headers.get('x-cron-secret')
  return queryToken === expected || headerToken === expected
}

async function handle(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { success: false, error: 'unauthorized' },
      { status: 401 },
    )
  }

  // Buat log row baru dengan triggeredBy='cron'.
  const log = await prisma.pricingResearchLog.create({
    data: { triggeredBy: 'cron', status: 'RUNNING' },
  })

  // Sync — tunggu selesai supaya cron job punya hasil pasti.
  const outcome = await runResearch(log.id)

  // Generate Alert kalau ada perubahan (added or updated > 0). Diff sudah
  // tersimpan di log; admin tinggal review di /admin/ai-pricing.
  if (
    outcome.status === 'SUCCESS' &&
    (outcome.added.length > 0 || outcome.updated.length > 0)
  ) {
    const summary = [
      outcome.added.length > 0 && `${outcome.added.length} model baru`,
      outcome.updated.length > 0 && `${outcome.updated.length} harga berubah`,
    ]
      .filter(Boolean)
      .join(', ')
    await prisma.alert.create({
      data: {
        level: 'YELLOW',
        category: 'PRICING_UPDATE',
        title: `AI Pricing research: ${summary}`,
        message: `Hasil research mingguan menemukan perubahan harga API. Review & apply di /admin/ai-pricing.`,
        metadata: {
          jobId: log.id,
          added: outcome.added.length,
          updated: outcome.updated.length,
        },
      },
    })
  }
  if (outcome.status === 'FAILED') {
    await prisma.alert.create({
      data: {
        level: 'RED',
        category: 'PRICING_UPDATE',
        title: 'AI Pricing research gagal',
        message: outcome.error ?? 'Unknown error',
        metadata: { jobId: log.id },
      },
    })
  }

  return NextResponse.json({
    success: true,
    data: {
      jobId: log.id,
      status: outcome.status,
      added: outcome.added.length,
      updated: outcome.updated.length,
    },
  })
}

export const POST = handle
export const GET = handle
