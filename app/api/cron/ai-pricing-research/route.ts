// POST or GET /api/cron/ai-pricing-research
// Scheduled trigger (cron-job.org / Vercel Cron) — jalankan research +
// generate Alert kalau ada perubahan supaya admin tahu di sidebar bell.
//
// Auth: terpusat di lib/cron-auth.ts (Bearer / x-cron-secret / ?secret=).
import { NextResponse } from 'next/server'

import { requireCronAuth } from '@/lib/cron-auth'
import { prisma } from '@/lib/prisma'
import { runResearch } from '@/lib/services/ai-pricing-research'

async function handle(req: Request) {
  const authErr = requireCronAuth(req)
  if (authErr) return authErr

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
