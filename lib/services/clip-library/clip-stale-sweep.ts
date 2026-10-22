// Sapu klip in-flight yang prosesnya mati (server restart / OOM / deploy saat
// job `after()` berjalan). Tanpa ini klip tertinggal spinner selamanya, dan
// guard anti klik-ganda di clip-start.ts akan terus menganggapnya "masih
// diproses". Dipanggil oleh cron kling-poll (global) dan GET /clips (lazy per
// host). Aturan klasifikasi ada di clip-job-rules.ts (murni, teruji).

import type { LiveClipStatus, Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'

import {
  CLIP_STALE_EARLY_MS,
  CLIP_STALE_MESSAGE,
  classifyStaleClip,
  IN_FLIGHT_CLIP_STATUSES,
} from './clip-job-rules'
import { KLING_FINALIZING_MARKER, KLING_LATE_MARKER } from './generate-clip'

export const LATE_MARKERS = [
  KLING_LATE_MARKER,
  KLING_FINALIZING_MARKER,
] as const
const MAX_PER_SWEEP = 50

export interface StaleSweepResult {
  handedOff: number
  ready: number
  failed: number
}

function dataFor(
  action: 'HAND_OFF' | 'READY' | 'FAILED',
): Prisma.LiveClipUpdateManyMutationInput {
  if (action === 'HAND_OFF') return { errorMessage: KLING_LATE_MARKER }
  if (action === 'READY') return { status: 'READY' as LiveClipStatus }
  return { status: 'FAILED' as LiveClipStatus, errorMessage: CLIP_STALE_MESSAGE }
}

export async function sweepStalledClips(
  opts: { hostTemplateId?: string; db?: Prisma.TransactionClient } = {},
): Promise<StaleSweepResult> {
  const db = opts.db ?? prisma
  const now = Date.now()
  const rows = await db.liveClip.findMany({
    where: {
      ...(opts.hostTemplateId ? { hostTemplateId: opts.hostTemplateId } : {}),
      status: { in: [...IN_FLIGHT_CLIP_STATUSES] },
      // Ambang terkecil; ambang per-tahap diputuskan classifyStaleClip.
      updatedAt: { lt: new Date(now - CLIP_STALE_EARLY_MS) },
    },
    select: {
      id: true,
      status: true,
      klingJobId: true,
      errorMessage: true,
      videoUrl: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'asc' },
    take: MAX_PER_SWEEP,
  })

  const result: StaleSweepResult = { handedOff: 0, ready: 0, failed: 0 }
  for (const row of rows) {
    const action = classifyStaleClip(row, LATE_MARKERS, now)
    if (!action) continue
    // Guard optimistik: baris yang bergerak sejak dibaca (job ternyata masih
    // hidup) tidak ikut tersapu.
    const res = await db.liveClip.updateMany({
      where: { id: row.id, status: row.status, updatedAt: row.updatedAt },
      data: dataFor(action),
    })
    if (res.count === 0) continue
    if (action === 'HAND_OFF') result.handedOff += 1
    else if (action === 'READY') result.ready += 1
    else result.failed += 1
    console.warn(
      `[clip-stale-sweep] klip ${row.id} (${row.status}, diam sejak ${row.updatedAt.toISOString()}) → ${action}`,
    )
  }
  return result
}
