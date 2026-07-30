// GET /api/cron/kling-poll?secret=<CRON_SECRET>
// Poll semua GenerationJob type=HOST_VIDEO status=RUNNING:
//   - IN_QUEUE/IN_PROGRESS → skip (re-poll lagi nanti)
//   - COMPLETED → fetch result, download MP4, settle charge, mark DONE
//   - FAILED → mark job + template error
// Idempotent — bisa dipanggil berkali-kali tanpa double-charge.
//
// Schedule: setiap 1 menit (di prod: cron-job.org → URL ini; di dev:
// lib/dev-cron-runner.ts auto-trigger setiap 60dtk).
import { NextResponse } from 'next/server'

import { requireCronAuth } from '@/lib/cron-auth'
import { finalizeLateLipsyncClips } from '@/lib/services/clip-library/late-lipsync-finalizer'
import { pollAndFinalizePendingVideos } from '@/lib/services/host-gen/queue'

export async function GET(req: Request) {
  // Auth terpusat di lib/cron-auth.ts — fail-closed kalau CRON_SECRET kosong
  // (dulu fail-open di sini). Dev-cron-runner panggil fungsi langsung, jadi
  // tidak terpengaruh.
  const authErr = requireCronAuth(req)
  if (authErr) return authErr

  const startedAt = Date.now()
  try {
    const result = await pollAndFinalizePendingVideos()
    // Klip Live: lanjutkan klip yang inline poll lipsync-nya timeout —
    // gagal di sini tidak boleh mengganggu poll video host di atas.
    let lateClips = null
    try {
      lateClips = await finalizeLateLipsyncClips()
    } catch (lateErr) {
      console.error('[kling-poll] late-lipsync error:', lateErr)
    }
    return NextResponse.json({
      success: true,
      data: {
        ...result,
        lateClips,
        durationMs: Date.now() - startedAt,
      },
    })
  } catch (err) {
    console.error('[kling-poll] error:', err)
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
