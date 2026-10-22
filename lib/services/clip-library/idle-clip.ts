// Pipeline klip IDLE — Kling image2video langsung (tanpa TTS, tanpa lipsync).
//
// Dulu jalan sinkron di POST /clips/idle-motion (poll s/d 5 menit → kena 524
// Cloudflare di 100 dtk) dan timeout = FAILED padahal task Kling masih jalan
// (Retry = bayar Kling dua kali). Sekarang (2026-10-22):
//   1. Route membuat baris lewat clip-start.ts lalu `after(runIdleClipJob)`
//   2. Job submit image2video → poll s/d 5 menit
//   3. Selesai → finalizeIdleClip (download + bill + READY, tanpa embedding —
//      IDLE dipilih via isDefaultIdle, bukan cosine)
//   4. Poll timeout → marker KLING_LATE_MARKER → cron kling-poll
//      (late-lipsync-finalizer) melanjutkan dengan pollKlingStatus.

import type { LiveClipStatus } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { pollKlingStatus, submitKlingVideo } from '@/lib/services/host-gen/kling'
import { computeMediaCharge } from '@/lib/services/media-charge'

import { IN_FLIGHT_CLIP_STATUSES } from './clip-job-rules'
import {
  downloadClipMp4,
  KLING_FINALIZING_MARKER,
  KLING_LATE_MARKER,
} from './generate-clip'
import type { IdleMotionPreset } from './idle-motions'

const POLL_INTERVAL_MS = 5_000
const POLL_TIMEOUT_MS = 300_000 // 5 menit; lewat itu diserahkan ke cron

export interface IdleClipJobInput {
  clipId: string
  userId: string
  sourceImageUrl: string
  motion: IdleMotionPreset
}

// Download + billing + READY. Dipakai job inline & cron finalizer. Billing
// non-throwing (klip tetap tersimpan), rate = KLIP_LIVE_LIPSYNC per detik
// (biaya Kling image2video setara per detik).
export async function finalizeIdleClip(input: {
  clipId: string
  userId: string
  videoUrl: string
  durationSec: number
  motionLabel: string
}): Promise<void> {
  const { clipId, userId, motionLabel } = input
  const downloaded = await downloadClipMp4(input.videoUrl, clipId)
  const seconds = Math.max(1, Math.round(input.durationSec))
  try {
    const charge = await computeMediaCharge({
      featureKey: 'KLIP_LIVE_LIPSYNC',
      units: seconds,
    })
    const { deductTokenAtomic } =
      await import('@/lib/services/ai-generation-log')
    const deducted = await deductTokenAtomic({
      userId,
      tokensCharged: charge.tokensCharged,
      description: `Klip Live IDLE motion (${motionLabel}) — ${seconds}dtk`,
      reference: `klip_idle:${clipId}`,
    })
    if (!deducted.ok) {
      console.warn(
        `[idle-clip ${clipId}] saldo kurang saat billing (${charge.tokensCharged} token) — klip tetap disimpan TANPA terpotong`,
      )
    }
  } catch (e) {
    console.warn(`[idle-clip ${clipId}] billing skip:`, (e as Error).message)
  }
  await prisma.liveClip.update({
    where: { id: clipId },
    data: {
      status: 'READY' as LiveClipStatus,
      videoUrl: downloaded.videoPath,
      durationMs: seconds * 1000,
      errorMessage: null,
    },
  })
}

async function markIdleFailed(clipId: string, message: string): Promise<void> {
  // Jangan menimpa klip yang sudah READY / sudah dipegang cron.
  await prisma.liveClip.updateMany({
    where: {
      id: clipId,
      status: { in: [...IN_FLIGHT_CLIP_STATUSES] },
      OR: [
        { errorMessage: null },
        {
          errorMessage: { notIn: [KLING_LATE_MARKER, KLING_FINALIZING_MARKER] },
        },
      ],
    },
    data: {
      status: 'FAILED' as LiveClipStatus,
      errorMessage: message.slice(0, 1000),
    },
  })
}

function absolutePublicUrl(url: string): string {
  if (url.startsWith('http')) return url
  const publicBase =
    process.env.PUBLIC_BASE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    'http://localhost:3000'
  return `${publicBase.replace(/\/$/, '')}${url}`
}

async function executeIdleClip(input: IdleClipJobInput): Promise<void> {
  const { clipId, motion } = input
  const submission = await submitKlingVideo({
    imageUrl: absolutePublicUrl(input.sourceImageUrl),
    prompt: motion.prompt,
    duration: motion.durationSec,
    mode: 'pro',
  })
  await prisma.liveClip.update({
    where: { id: clipId },
    data: { klingJobId: submission.requestId },
  })

  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    const status = await pollKlingStatus({ requestId: submission.requestId })
    if (status.status === 'COMPLETED' && status.videoUrl) {
      await finalizeIdleClip({
        clipId,
        userId: input.userId,
        videoUrl: status.videoUrl,
        durationSec: status.durationSeconds || motion.durationSec,
        motionLabel: motion.label,
      })
      return
    }
    if (status.status === 'FAILED') {
      throw new Error(`Kling failed: ${status.rawError ?? '?'}`)
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }

  // Timeout lokal ≠ task gagal — serahkan ke cron (tanpa submit ulang).
  await prisma.liveClip.update({
    where: { id: clipId },
    data: { errorMessage: KLING_LATE_MARKER },
  })
  console.warn(
    `[idle-clip ${clipId}] poll timeout — diserahkan ke cron kling-poll (task ${submission.requestId})`,
  )
}

// Never-throw: dipanggil dari `after()`.
export async function runIdleClipJob(input: IdleClipJobInput): Promise<void> {
  try {
    await executeIdleClip(input)
  } catch (err) {
    console.error(`[idle-clip ${input.clipId}] gagal:`, err)
    await markIdleFailed(input.clipId, (err as Error).message).catch((e) =>
      console.error(`[idle-clip ${input.clipId}] gagal menandai FAILED:`, e),
    )
  }
}
