// GET /api/cron/live-objection-extract?secret=<CRON_SECRET>
// Batch analyze sessions yang belum punya objection tag.
// Schedule rekomendasi: tiap jam (di prod via cron-job.org).
import { NextResponse } from 'next/server'

import { batchAnalyzePendingSessions } from '@/lib/services/live/objection-analyzer'

const CRON_SECRET = process.env.CRON_SECRET ?? ''

function authOk(url: URL): boolean {
  if (!CRON_SECRET) return true
  return url.searchParams.get('secret') === CRON_SECRET
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  if (!authOk(url)) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }
  const limit = Math.min(50, Number(url.searchParams.get('limit') ?? 20))
  const startedAt = Date.now()
  try {
    const result = await batchAnalyzePendingSessions({ limit })
    return NextResponse.json({
      success: true,
      data: { ...result, durationMs: Date.now() - startedAt },
    })
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: (err as Error).message,
        durationMs: Date.now() - startedAt,
      },
      { status: 500 },
    )
  }
}
