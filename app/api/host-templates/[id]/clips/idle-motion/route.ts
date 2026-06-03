// POST /api/host-templates/[id]/clips/idle-motion
// Generate IDLE clip pakai Kling image2video langsung (NO TTS, NO lipsync).
// Owner pilih dari 30 motion presets. Video silent dengan motion menarik.
//
// Body: { motionPresetId: string }
// Returns: { clipId, status }
//
// Flow:
//   1. Kling image2video submit (mode pro) dengan motion prompt preset
//   2. Poll Kling sampai DONE
//   3. Download MP4
//   4. Save LiveClip status=READY category=IDLE script=presetLabel
//      audioUrl=null (memang silent)
//   5. Skip embed — IDLE clips di-pick by isDefaultIdle flag, gak match cosine

import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { getIdleMotionById } from '@/lib/services/clip-library/idle-motions'
import {
  downloadKlingVideo,
  pollKlingStatus,
  submitKlingVideo,
} from '@/lib/services/host-gen/kling'
import {
  computeMediaCharge,
  executeMediaSync,
} from '@/lib/services/media-charge'

const schema = z.object({
  motionPresetId: z.string().min(1).max(80),
})

const POLL_INTERVAL_MS = 5000
const POLL_TIMEOUT_MS = 300_000 // 5 menit max

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params

  const host = await prisma.hostTemplate.findUnique({
    where: { id },
    select: { id: true, userId: true, mode: true, sourceImageUrl: true },
  })
  if (!host) return jsonError('Host tidak ditemukan', 404)
  if (session.user.role !== 'ADMIN' && host.userId !== session.user.id) {
    return jsonError('Tidak punya akses', 403)
  }
  if (host.mode !== 'NATIVE_LIBRARY') {
    return jsonError('Host bukan mode Klip Live', 400)
  }
  if (!host.sourceImageUrl) {
    return jsonError('Source image belum ada', 400)
  }

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body invalid', 400)
  }
  const motion = getIdleMotionById(parsed.data.motionPresetId)
  if (!motion) return jsonError('Motion preset tidak ditemukan', 400)

  // Create LiveClip DRAFT, status GENERATING_VIDEO
  const clip = await prisma.liveClip.create({
    data: {
      hostTemplateId: id,
      userId: host.userId,
      scriptOriginal: motion.label,
      transcript: motion.label, // utk display saja
      summary: `Idle motion: ${motion.emoji} ${motion.label}`,
      category: 'IDLE',
      tags: ['idle-motion', motion.category, motion.id],
      source: 'GENERATED',
      status: 'GENERATING_VIDEO',
    },
    select: { id: true },
  })

  try {
    // Kling image2video submit (bill via KLIP_LIVE_LIPSYNC seconds rate yang sama
    // dengan image2video — gak ada lipsync, tapi cost equivalent per detik).
    const publicBase =
      process.env.PUBLIC_BASE_URL?.trim() ||
      process.env.NEXTAUTH_URL?.trim() ||
      'http://localhost:3000'
    const absImage = host.sourceImageUrl.startsWith('http')
      ? host.sourceImageUrl
      : `${publicBase.replace(/\/$/, '')}${host.sourceImageUrl}`

    const submission = await submitKlingVideo({
      imageUrl: absImage,
      prompt: motion.prompt,
      duration: motion.durationSec,
      mode: 'pro',
    })
    await prisma.liveClip.update({
      where: { id: clip.id },
      data: { klingJobId: submission.requestId },
    })

    // Poll sampai DONE
    const deadline = Date.now() + POLL_TIMEOUT_MS
    let videoUrl: string | null = null
    let durationSec = motion.durationSec
    while (Date.now() < deadline) {
      const status = await pollKlingStatus({ requestId: submission.requestId })
      if (status.status === 'COMPLETED' && status.videoUrl) {
        videoUrl = status.videoUrl
        durationSec = status.durationSeconds || motion.durationSec
        break
      }
      if (status.status === 'FAILED') {
        throw new Error(`Kling failed: ${status.rawError ?? '?'}`)
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    }
    if (!videoUrl) throw new Error('Kling timeout >5 menit')

    // Download MP4
    const dl = await downloadKlingVideo({
      userId: host.userId,
      videoUrl,
    })
    // Move ke /uploads/clips/<clipId>.mp4 (sesuai pattern clip lain)
    const clipsDir = path.join(process.cwd(), 'public', 'uploads', 'clips')
    await mkdir(clipsDir, { recursive: true })
    const finalPath = `/uploads/clips/${clip.id}.mp4`
    const absSource = path.join(process.cwd(), 'public', dl.videoPath.replace(/^\//, ''))
    const buf = await import('node:fs/promises').then((m) => m.readFile(absSource))
    await writeFile(path.join(clipsDir, `${clip.id}.mp4`), buf)

    // Bill cost — sama rate sebagai Kling image2video (KLIP_LIVE_LIPSYNC unit detik)
    try {
      const charge = await computeMediaCharge({
        featureKey: 'KLIP_LIVE_LIPSYNC',
        units: Math.round(durationSec),
      })
      const { deductTokenAtomic } = await import('@/lib/services/ai-generation-log')
      await deductTokenAtomic({
        userId: host.userId,
        tokensCharged: charge.tokensCharged,
        description: `Klip Live IDLE motion (${motion.label}) — ${Math.round(durationSec)}dtk`,
        reference: `klip_idle:${clip.id}`,
      })
    } catch (e) {
      console.warn('[idle-motion] billing skip:', (e as Error).message)
    }

    await prisma.liveClip.update({
      where: { id: clip.id },
      data: {
        status: 'READY',
        videoUrl: finalPath,
        durationMs: Math.round(durationSec * 1000),
        errorMessage: null,
      },
    })
    return jsonOk({ clipId: clip.id, videoUrl: finalPath, durationMs: Math.round(durationSec * 1000) })
  } catch (e) {
    await prisma.liveClip.update({
      where: { id: clip.id },
      data: {
        status: 'FAILED',
        errorMessage: (e as Error).message.slice(0, 1000),
      },
    })
    return jsonError((e as Error).message, 500)
  }
}
