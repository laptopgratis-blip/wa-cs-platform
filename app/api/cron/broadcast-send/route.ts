// GET/POST /api/cron/broadcast-send?secret=...
// Jadwal: TIAP 1 MENIT via cron-job.org.
// 1) Broadcast SCHEDULED yang sudah jatuh tempo → startBroadcast (kedua provider).
// 2) Broadcast SENDING provider CLOUD_API → lanjutkan batch (worker tanpa Redis).
//    Satu run memproses maks MAX_SENDING broadcast × maxPerRun penerima.
import { NextResponse } from 'next/server'

import { requireCronAuth } from '@/lib/cron-auth'
import { prisma } from '@/lib/prisma'
import { runCloudBroadcastBatch } from '@/lib/services/broadcast/cloud-runner'
import { startBroadcast } from '@/lib/services/broadcast/start'

const MAX_SCHEDULED = 10
const MAX_SENDING = 5
const MAX_PER_RUN = 120
// Broadcast SENDING cloud yang heartbeat-nya masih baru sedang diproses run
// lain (after() dari /send atau cron sebelumnya) — lewati. Worker menyegarkan
// heartbeat tiap 5 item; 90 dtk memberi ruang untuk backoff rate-limit tanpa
// memicu worker paralel (klaim per-recipient tetap atomik sebagai lapis kedua).
const ACTIVE_HEARTBEAT_MS = 90 * 1000

async function handle(req: Request) {
  const authErr = requireCronAuth(req)
  if (authErr) return authErr

  const startedAt = Date.now()
  try {
    // ── 1) SCHEDULED due ──
    const due = await prisma.broadcast.findMany({
      where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } },
      orderBy: { scheduledAt: 'asc' },
      take: MAX_SCHEDULED,
      select: { id: true },
    })
    const started: { id: string; ok: boolean; error?: string }[] = []
    for (const b of due) {
      const r = await startBroadcast(b.id, { trigger: 'cron' })
      started.push({ id: b.id, ok: r.ok, ...(r.ok ? {} : { error: r.error }) })
      if (!r.ok) {
        // Gagal start (mis. kredit kurang) → PAUSED supaya user tahu, bukan
        // dicoba lagi tiap menit diam-diam.
        await prisma.broadcast
          .updateMany({
            where: { id: b.id, status: 'SCHEDULED' },
            data: { status: 'PAUSED', pausedReason: r.error.slice(0, 500) },
          })
          .catch(() => undefined)
      }
    }

    // ── 2) SENDING cloud → batch ──
    const sending = await prisma.broadcast.findMany({
      where: {
        status: 'SENDING',
        provider: 'CLOUD_API',
        OR: [{ lastBatchAt: null }, { lastBatchAt: { lt: new Date(Date.now() - ACTIVE_HEARTBEAT_MS) } }],
      },
      orderBy: { lastBatchAt: 'asc' },
      take: MAX_SENDING,
      select: { id: true },
    })
    const batches = []
    for (const b of sending) {
      batches.push(await runCloudBroadcastBatch(b.id, { maxPerRun: MAX_PER_RUN }))
    }

    return NextResponse.json({
      success: true,
      data: { started, batches, durationMs: Date.now() - startedAt },
    })
  } catch (err) {
    console.error('[cron/broadcast-send] gagal:', err)
    return NextResponse.json({ success: false, error: 'internal error' }, { status: 500 })
  }
}

export async function GET(req: Request) {
  return handle(req)
}
export async function POST(req: Request) {
  return handle(req)
}
