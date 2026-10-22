// POST /api/host-templates/[id]/clips/idle-motion
// Generate IDLE clip pakai Kling image2video langsung (NO TTS, NO lipsync).
// Owner pilih dari 30 motion presets. Video silent dengan motion menarik.
//
// Body: { motionPresetId: string, allowDuplicate?: boolean }
// Returns 202: { clipId, status, alreadyRunning }
//
// BACKGROUND JOB (2026-10-22): dulu poll Kling s/d 5 menit di dalam request
// (kena 524 Cloudflare di 100 dtk) dan timeout = FAILED padahal task Kling
// masih jalan. Sekarang clip-start.ts (precheck saldo + anti klik-ganda +
// buat baris) → `after()` runIdleClipJob (lib/services/clip-library/idle-clip.ts;
// timeout diserahkan ke cron kling-poll). IDLE tanpa embed — dipilih via
// isDefaultIdle, bukan cosine.

import { after, type NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import {
  ClipStartError,
  startIdleClip,
} from '@/lib/services/clip-library/clip-start'
import { runIdleClipJob } from '@/lib/services/clip-library/idle-clip'
import { getIdleMotionById } from '@/lib/services/clip-library/idle-motions'

const schema = z.object({
  motionPresetId: z.string().min(1).max(80),
  allowDuplicate: z.boolean().optional(),
})

// Lihat catatan maxDuration di ../route.ts — route sendiri selesai < 2 dtk.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

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

  try {
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
    const sourceImageUrl = host.sourceImageUrl
    if (!sourceImageUrl) {
      return jsonError('Source image belum ada', 400)
    }

    const parsed = schema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'Body invalid', 400)
    }
    const motion = getIdleMotionById(parsed.data.motionPresetId)
    if (!motion) return jsonError('Motion preset tidak ditemukan', 400)

    const started = await startIdleClip({
      hostTemplateId: id,
      userId: host.userId,
      motion,
      allowDuplicate: parsed.data.allowDuplicate,
    })
    if (!started.alreadyRunning) {
      after(() =>
        runIdleClipJob({
          clipId: started.clipId,
          userId: host.userId,
          sourceImageUrl,
          motion,
        }),
      )
    }
    return jsonOk(started, 202)
  } catch (e) {
    if (e instanceof ClipStartError) {
      return Response.json(
        { success: false, error: e.message, code: e.code },
        { status: e.status },
      )
    }
    console.error(`[POST /api/host-templates/${id}/clips/idle-motion] gagal memulai:`, e)
    return jsonError('Gagal memulai generate klip IDLE. Coba lagi sebentar lagi.', 500)
  }
}
