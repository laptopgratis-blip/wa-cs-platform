// Finalizer untuk klip yang inline poll lipsync-nya timeout (>5 menit).
// generate-clip menandai klip dengan KLING_LATE_MARKER (status tetap
// GENERATING_VIDEO) lalu return; cron kling-poll (tiap 1 menit) memanggil
// finalizeLateLipsyncClips() di sini:
//   COMPLETED     → download + bill + embed → READY (tanpa submit ulang —
//                   hemat kredit Kling dibanding Retry manual)
//   FAILED        → mark FAILED (user bisa Retry)
//   masih jalan   → biarkan; lewat deadline 45 menit → FAILED
// Idempotent: claim atomik via errorMessage marker supaya dua tick cron
// tidak memproses klip yang sama.

import type { LiveClipStatus } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { pollKlingLipsync } from '@/lib/services/host-gen/kling'

import {
  billClipLipsync,
  downloadClipMp4,
  finishClipEmbedding,
  KLING_FINALIZING_MARKER,
  KLING_LATE_MARKER,
} from './generate-clip'

// Lewat 45 menit sejak klip dibuat masih belum selesai → nyerah, mark FAILED.
const LATE_DEADLINE_MS = 45 * 60_000
// Claim FINALIZING yang macet (proses mati saat download) boleh direbut
// tick lain setelah 10 menit.
const STALE_CLAIM_MS = 10 * 60_000
// Batasi per tick supaya cron tetap cepat (tiap klip = 1 poll + mungkin
// 1 download MP4).
const MAX_CLIPS_PER_TICK = 10

export interface LateFinalizeResult {
  checked: number
  completed: number
  failed: number
  pending: number
}

export async function finalizeLateLipsyncClips(): Promise<LateFinalizeResult> {
  const now = Date.now()
  const staleClaimBefore = new Date(now - STALE_CLAIM_MS)
  const candidates = await prisma.liveClip.findMany({
    where: {
      status: 'GENERATING_VIDEO' as LiveClipStatus,
      klingJobId: { not: null },
      OR: [
        { errorMessage: KLING_LATE_MARKER },
        {
          errorMessage: KLING_FINALIZING_MARKER,
          updatedAt: { lt: staleClaimBefore },
        },
      ],
    },
    select: {
      id: true,
      userId: true,
      klingJobId: true,
      transcript: true,
      createdAt: true,
      errorMessage: true,
    },
    orderBy: { createdAt: 'asc' },
    take: MAX_CLIPS_PER_TICK,
  })

  const result: LateFinalizeResult = {
    checked: candidates.length,
    completed: 0,
    failed: 0,
    pending: 0,
  }

  for (const clip of candidates) {
    // Claim atomik — tick cron lain yang pegang klip sama dapat count 0.
    const claimed = await prisma.liveClip.updateMany({
      where: {
        id: clip.id,
        status: 'GENERATING_VIDEO' as LiveClipStatus,
        errorMessage: clip.errorMessage,
      },
      data: { errorMessage: KLING_FINALIZING_MARKER },
    })
    if (claimed.count === 0) continue

    try {
      const polled = await pollKlingLipsync({ requestId: clip.klingJobId! })

      if (polled.status === 'COMPLETED' && polled.videoUrl) {
        const downloaded = await downloadClipMp4(polled.videoUrl, clip.id)
        const seconds = Math.max(1, Math.round(polled.durationSeconds ?? 0))
        await billClipLipsync({ clipId: clip.id, userId: clip.userId, seconds })
        await prisma.liveClip.update({
          where: { id: clip.id },
          data: {
            videoUrl: downloaded.videoPath,
            durationMs: Math.round((polled.durationSeconds ?? 0) * 1000) || undefined,
            errorMessage: null,
          },
        })
        await finishClipEmbedding({
          clipId: clip.id,
          userId: clip.userId,
          script: clip.transcript ?? '',
        })
        result.completed += 1
        console.log(
          `[late-lipsync] klip ${clip.id} selesai via cron (task ${clip.klingJobId})`,
        )
        continue
      }

      if (polled.status === 'FAILED') {
        await prisma.liveClip.update({
          where: { id: clip.id },
          data: {
            status: 'FAILED' as LiveClipStatus,
            errorMessage: `Kling lipsync failed: ${(polled.rawError ?? '?').slice(0, 900)}`,
          },
        })
        result.failed += 1
        continue
      }

      // Masih antri/proses di Kling.
      if (now - clip.createdAt.getTime() > LATE_DEADLINE_MS) {
        await prisma.liveClip.update({
          where: { id: clip.id },
          data: {
            status: 'FAILED' as LiveClipStatus,
            errorMessage: 'Kling lipsync tidak selesai >45 menit — silakan Retry.',
          },
        })
        result.failed += 1
      } else {
        await prisma.liveClip.update({
          where: { id: clip.id },
          data: { errorMessage: KLING_LATE_MARKER },
        })
        result.pending += 1
      }
    } catch (e) {
      // Error transient (network/Kling API) — kembalikan marker supaya
      // dicoba lagi di tick berikutnya.
      console.warn(`[late-lipsync] klip ${clip.id} error:`, (e as Error).message)
      await prisma.liveClip
        .update({
          where: { id: clip.id },
          data: { errorMessage: KLING_LATE_MARKER },
        })
        .catch(() => {})
      result.pending += 1
    }
  }

  return result
}
