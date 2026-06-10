// GET /api/cron/live-objection-extract?secret=<CRON_SECRET>
// Batch analyze sessions yang belum punya objection tag.
// Schedule rekomendasi: tiap jam (di prod via cron-job.org).
import { NextResponse } from 'next/server'

import { requireCronAuth } from '@/lib/cron-auth'
import { batchAnalyzePendingSessions } from '@/lib/services/live/objection-analyzer'

export async function GET(req: Request) {
  // Auth terpusat di lib/cron-auth.ts — fail-closed kalau CRON_SECRET kosong
  // (dulu fail-open di sini).
  const authErr = requireCronAuth(req)
  if (authErr) return authErr
  const url = new URL(req.url)
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
