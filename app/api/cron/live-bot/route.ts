// GET/POST /api/cron/live-bot?secret=...
// Trigger 1 tick bot live runner. Setup di cron-job.org panggil 1x tiap 30 detik.
// Service:
//   - lihat semua LiveRoom aktif + botEnabled
//   - skip kalau real user chat <60dtk lalu
//   - skip kalau bot chat <botIntervalMinSec lalu
//   - fire random prompt dari botPrompts dengan random viewer name

import { NextResponse } from 'next/server'

import { runLiveBotTick } from '@/lib/services/live/bot-runner'

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const url = new URL(req.url)
  return (
    url.searchParams.get('secret') === expected ||
    req.headers.get('x-cron-secret') === expected
  )
}

async function handle(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { success: false, error: 'unauthorized' },
      { status: 401 },
    )
  }
  try {
    const baseUrl = new URL(req.url).origin
    const r = await runLiveBotTick({ baseUrl })
    return NextResponse.json({ success: true, data: r })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: (e as Error).message },
      { status: 500 },
    )
  }
}

export const GET = handle
export const POST = handle
