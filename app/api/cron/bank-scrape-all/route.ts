// POST or GET /api/cron/bank-scrape-all
//
// Cron yang trigger bank-scraper service untuk semua user yang due (interval
// scrape default 15 menit per user). Service yang lakukan batching + jitter
// supaya tidak burst BCA.
//
// Setup eksternal: cron-job.org atau similar, hit:
//   https://hulao.id/api/cron/bank-scrape-all?secret=<CRON_SECRET>
// Frequency: tiap 15 menit.
//
// Auth: terpusat di lib/cron-auth.ts (Bearer / x-cron-secret / ?secret=).
import { NextResponse } from 'next/server'

import { requireCronAuth } from '@/lib/cron-auth'
import { triggerCronRunAll } from '@/lib/services/bank-scraper'

async function handle(req: Request) {
  const authErr = requireCronAuth(req)
  if (authErr) return authErr

  const result = await triggerCronRunAll()
  if (!result.ok) {
    return NextResponse.json(
      {
        success: false,
        error: `Scraper service tidak responsif: ${result.error || result.status}`,
      },
      { status: 502 },
    )
  }

  return NextResponse.json({ success: true, data: result.data })
}

export async function GET(req: Request) {
  return handle(req)
}
export async function POST(req: Request) {
  return handle(req)
}
