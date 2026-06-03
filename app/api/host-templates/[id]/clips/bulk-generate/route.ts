// POST /api/host-templates/[id]/clips/bulk-generate — terima list scripts
// approved by user, generate semua sequentially di background.
//
// Body: { scripts: [{ category, script }], voiceId? }
// Returns immediately dengan { jobId, queued: N }
// Progress dicek via GET /clips (status per klip)
//
// Strategi: spawn async loop di server (fire-and-forget), tiap iteration
// generate 1 klip via generateClip() — IDLE script kosong → buat clip
// placeholder dengan source upload OR skip.

import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { generateClip } from '@/lib/services/clip-library/generate-clip'

const ALLOWED_CATEGORIES = [
  'GREETING',
  'PRODUCT_DEMO',
  'PRICE',
  'OBJECTION',
  'CLOSING',
  'IDLE',
  'GENERAL',
] as const

const schema = z.object({
  scripts: z
    .array(
      z.object({
        category: z.enum(ALLOWED_CATEGORIES),
        script: z.string().trim().max(200),
      }),
    )
    .min(1)
    .max(25),
  voiceId: z.string().trim().min(8).max(80),
})

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
    select: { id: true, userId: true, mode: true, sourceImageUrl: true, visionAnalysis: true },
  })
  if (!host) return jsonError('Host tidak ditemukan', 404)
  if (session.user.role !== 'ADMIN' && host.userId !== session.user.id) {
    return jsonError('Tidak punya akses', 403)
  }
  if (host.mode !== 'NATIVE_LIBRARY') {
    return jsonError('Host bukan mode Klip Live', 400)
  }
  if (!host.visionAnalysis) {
    return jsonError('Vision analyzer belum jalan', 400)
  }

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body invalid', 400)
  }

  // Filter: IDLE scripts kosong → buat placeholder clip (script "diam senyum").
  // GENERATED clip butuh script non-empty → pakai placeholder text untuk IDLE.
  const requests = parsed.data.scripts
    .map((s) => ({
      category: s.category,
      script: s.script.trim() || (s.category === 'IDLE' ? 'Mmm hmm' : ''),
    }))
    .filter((s) => s.script.length > 0)

  if (requests.length === 0) {
    return jsonError('Tidak ada script valid', 400)
  }

  // Resolve baseline pool — ambil SEMUA DONE baselines (multi-variant),
  // rotate antar variants supaya klip lipsync gak monoton.
  const baselineJobs = await prisma.generationJob.findMany({
    where: { hostTemplateId: id, type: 'HOST_VIDEO', status: 'DONE' },
    orderBy: { finishedAt: 'desc' },
    select: { inputPayload: true },
  })
  const baselineKlingVideoIds: string[] = []
  for (const j of baselineJobs) {
    const vid = (j.inputPayload as { klingVideoId?: string } | null)?.klingVideoId
    if (vid && !baselineKlingVideoIds.includes(vid)) baselineKlingVideoIds.push(vid)
  }
  if (baselineKlingVideoIds.length === 0) {
    return jsonError('Baseline video belum siap', 400)
  }
  console.log(
    `[bulk-generate ${id}] ${baselineKlingVideoIds.length} baseline variants tersedia, ${requests.length} klip akan rotate antar variants`,
  )

  // Fire-and-forget async loop. Tiap klip pakai generateClip() yg synchronous
  // (2-4 menit Kling lipsync). Rotate sourceVideoId antar baselines.
  void (async () => {
    for (let i = 0; i < requests.length; i++) {
      const r = requests[i]!
      // Round-robin baseline rotation. Klip ke-0 → variant 0, klip ke-1 →
      // variant 1, dst. Klip Nth modulo total variants.
      const sourceVideoId = baselineKlingVideoIds[i % baselineKlingVideoIds.length]!
      try {
        await generateClip({
          hostTemplateId: id,
          userId: host.userId,
          script: r.script,
          category: r.category,
          voiceId: parsed.data.voiceId,
          sourceVideoId,
        })
      } catch (e) {
        console.warn(
          `[bulk-generate ${id}] klip ${i + 1}/${requests.length} "${r.script.slice(0, 30)}" gagal:`,
          (e as Error).message,
        )
      }
    }
    console.log(`[bulk-generate ${id}] selesai ${requests.length} klip`)
  })().catch((e) => console.error('[bulk-generate] top error:', e))

  return jsonOk({ queued: requests.length, voiceId: parsed.data.voiceId })
}
