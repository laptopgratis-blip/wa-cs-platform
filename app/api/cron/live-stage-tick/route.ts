// GET/POST /api/cron/live-stage-tick?secret=...
// Panggung Bersama: lanjutkan antrian pertanyaan di semua room aktif. Panggil
// tiap ~2 detik (cron-job.org / dev-cron in-process). advanceStage no-op kalau
// room masih menjawab, generate jawaban berikutnya kalau host idle.
import { NextResponse } from 'next/server'

import { runStageTick } from '@/lib/services/live/stage'

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
    const r = await runStageTick()
    return NextResponse.json({ success: true, data: r })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: (e as Error).message },
      { status: 500 },
    )
  }
}

export async function GET(req: Request) {
  return handle(req)
}

export async function POST(req: Request) {
  return handle(req)
}
