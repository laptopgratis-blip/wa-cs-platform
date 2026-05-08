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
// Auth: header `x-cron-secret` atau query `?secret=` == CRON_SECRET.
import { NextResponse } from 'next/server'

import { triggerCronRunAll } from '@/lib/services/bank-scraper'

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
