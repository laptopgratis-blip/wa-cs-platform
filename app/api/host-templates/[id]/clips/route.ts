// GET  /api/host-templates/[id]/clips — list klip untuk host (owner/admin)
// POST /api/host-templates/[id]/clips — generate klip baru dari script
//
// POST body: { script, category, productId?, tags?, voiceId?, sourceVideoId?,
//              sourceVideoUrl?, allowDuplicate? }
// BACKGROUND JOB (2026-10-22): dulu route ini menunggu TTS + Kling lipsync
// (220–270 dtk) — Cloudflare memutus di 100 dtk (524) sehingga user melihat
// "Unexpected token '<'…", lalu klik ulang → klip & token dobel. Sekarang:
// clip-start.ts (validasi + precheck saldo + anti klik-ganda + buat baris)
// → `after()` runClipPipelineJob → balas 202 { clipId, status, alreadyRunning }.
// UI polling GET list sampai klip READY/FAILED.

import { after, type NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import {
  ClipStartError,
  startGeneratedClip,
} from '@/lib/services/clip-library/clip-start'
import { sweepStalledClips } from '@/lib/services/clip-library/clip-stale-sweep'
import { runClipPipelineJob } from '@/lib/services/clip-library/generate-clip'

// Route sendiri selesai < 2 dtk; di platform yang menegakkan maxDuration,
// callback `after()` ikut dibatasi nilai ini. Server Node self-hosted (hulao)
// tidak menegakkannya — job dibatasi poll Kling 5 menit + cron finalizer.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const ALLOWED_CATEGORIES = [
  'GREETING',
  'PRODUCT_DEMO',
  'PRICE',
  'OBJECTION',
  'CLOSING',
  'IDLE',
  'GENERAL',
] as const

const generateSchema = z.object({
  script: z.string().trim().min(3).max(2500),
  category: z.enum(ALLOWED_CATEGORIES),
  productId: z.string().cuid().optional().nullable(),
  tags: z.array(z.string().max(40)).max(10).optional(),
  voiceId: z.string().trim().max(80).optional(),
  sourceVideoId: z.string().trim().max(120).optional(),
  sourceVideoUrl: z.string().trim().url().optional(),
  ownerExtra: z.string().max(500).optional(),
  // true = user sudah konfirmasi buat klip kembar (respons 409 sebelumnya).
  allowDuplicate: z.boolean().optional(),
})

async function authorizeHost(
  hostTemplateId: string,
  userId: string,
  isAdmin: boolean,
) {
  const host = await prisma.hostTemplate.findUnique({
    where: { id: hostTemplateId },
    select: { id: true, userId: true, mode: true, sourceImageUrl: true, visionAnalysis: true },
  })
  if (!host) throw new Error('Host tidak ditemukan')
  if (!isAdmin && host.userId !== userId) {
    throw new Error('Tidak punya akses ke host ini')
  }
  return host
}

export async function GET(
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
    await authorizeHost(id, session.user.id, session.user.role === 'ADMIN')
  } catch (e) {
    return jsonError((e as Error).message, 403)
  }

  // Lazy sweep: klip yang job-nya mati (restart) tidak spinner selamanya.
  await sweepStalledClips({ hostTemplateId: id }).catch((e) =>
    console.warn('[GET clips] sweep klip macet gagal:', (e as Error).message),
  )

  const clips = await prisma.liveClip.findMany({
    where: { hostTemplateId: id },
    orderBy: [{ category: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      scriptOriginal: true,
      transcript: true,
      summary: true,
      category: true,
      tags: true,
      productId: true,
      audioUrl: true,
      videoUrl: true,
      thumbnailUrl: true,
      durationMs: true,
      voiceId: true,
      voiceName: true,
      source: true,
      status: true,
      errorMessage: true,
      isActive: true,
      isEvergreen: true,
      isDefaultIdle: true,
      triggerKeywords: true,
      matchMode: true,
      manualConfidence: true,
      useCount: true,
      lastUsedAt: true,
      createdAt: true,
    },
  })
  return jsonOk({ clips })
}

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

  let host
  try {
    host = await authorizeHost(id, session.user.id, session.user.role === 'ADMIN')
  } catch (e) {
    return jsonError((e as Error).message, 403)
  }

  // Pre-req: host harus NATIVE_LIBRARY mode + sourceImage + visionAnalysis ready.
  if (host.mode !== 'NATIVE_LIBRARY') {
    return jsonError('Host bukan mode Klip Live. Buat host baru pilih Klip Live mode.', 400)
  }
  if (!host.sourceImageUrl) {
    return jsonError('Host belum punya source image — generate dulu.', 400)
  }
  if (!host.visionAnalysis) {
    return jsonError(
      'Host belum di-vision-analyze. Trigger POST /api/host-templates/[id]/analyze-image dulu.',
      400,
    )
  }

  const parsed = generateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body invalid', 400)
  }

  // Sprint 5+: auto-resolve sourceVideoId dari baseline silent loop video kalau
  // owner gak supply manual. Pull klingVideoId (videos[0].id, BUKAN task_id!)
  // dari recent GenerationJob HOST_VIDEO inputPayload.
  let sourceVideoId = parsed.data.sourceVideoId
  let sourceVideoUrl = parsed.data.sourceVideoUrl
  if (!sourceVideoId && !sourceVideoUrl) {
    const baseline = await prisma.generationJob.findFirst({
      where: {
        hostTemplateId: id,
        type: 'HOST_VIDEO',
        status: 'DONE',
      },
      orderBy: { finishedAt: 'desc' },
      select: { inputPayload: true },
    })
    const payload = baseline?.inputPayload as
      | { klingVideoId?: string; klingVideoUrl?: string }
      | null
    if (payload?.klingVideoId) {
      sourceVideoId = payload.klingVideoId
    } else if (payload?.klingVideoUrl) {
      sourceVideoUrl = payload.klingVideoUrl
    }
  }
  if (!sourceVideoId && !sourceVideoUrl) {
    return jsonError(
      'Belum ada baseline video. Tunggu host generate baseline silent loop selesai (~60-90dtk setelah image ready).',
      400,
    )
  }

  try {
    const pipelineInput = {
      hostTemplateId: id,
      userId: host.userId,
      script: parsed.data.script,
      category: parsed.data.category,
      productId: parsed.data.productId ?? null,
      tags: parsed.data.tags,
      voiceId: parsed.data.voiceId,
      sourceVideoId,
      sourceVideoUrl,
      ownerExtra: parsed.data.ownerExtra,
    }
    const started = await startGeneratedClip({
      ...pipelineInput,
      allowDuplicate: parsed.data.allowDuplicate,
    })
    if (!started.alreadyRunning) {
      after(() =>
        runClipPipelineJob(started.clipId, {
          ...pipelineInput,
          script: started.script,
        }),
      )
    }
    return jsonOk(
      {
        clipId: started.clipId,
        status: started.status,
        alreadyRunning: started.alreadyRunning,
      },
      202,
    )
  } catch (e) {
    if (e instanceof ClipStartError) {
      return Response.json(
        { success: false, error: e.message, code: e.code },
        { status: e.status },
      )
    }
    console.error(`[POST /api/host-templates/${id}/clips] gagal memulai:`, e)
    return jsonError('Gagal memulai generate klip. Coba lagi sebentar lagi.', 500)
  }
}
