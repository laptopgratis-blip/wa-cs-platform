// GET  /api/admin/host-templates — list semua host template milik admin
// POST /api/admin/host-templates — bikin template baru + trigger Gemini sync.
//                                  Setelah image ready, caller pisah panggil
//                                  /api/admin/host-templates/[id]/video.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { enqueueAndRunImageJob } from '@/lib/services/host-gen/queue'
import { InsufficientBalanceError } from '@/lib/services/media-charge'

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  visualStyle: z.string().trim().max(200).optional(),
  promptImage: z.string().trim().min(10).max(2000),
  promptVideo: z.string().trim().min(5).max(1000),
  refImageUrls: z
    .array(z.string().startsWith('/uploads/'))
    .max(14)
    .default([]),
  isPublic: z.boolean().default(true), // admin default publik (library)
  // Sprint 1: HostMode — default TTS_GENERATIVE (existing flow).
  mode: z.enum(['TTS_GENERATIVE', 'NATIVE_LIBRARY']).default('TTS_GENERATIVE'),
})

export async function GET() {
  let session
  try {
    session = await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const rows = await prisma.hostTemplate.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      visualStyle: true,
      status: true,
      sourceImageUrl: true,
      videoLoopUrl: true,
      videoSeconds: true,
      isPublic: true,
      errorMessage: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  return jsonOk(rows)
}

export async function POST(req: Request) {
  let session
  try {
    session = await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid', 400)
  }
  const data = parsed.data

  // Bikin row DRAFT dulu supaya admin lihat status realtime.
  const tpl = await prisma.hostTemplate.create({
    data: {
      userId: session.user.id,
      name: data.name,
      visualStyle: data.visualStyle ?? null,
      promptImage: data.promptImage,
      promptVideo: data.promptVideo,
      refImageUrls: data.refImageUrls,
      mode: data.mode,
      isPublic: data.isPublic,
    },
    select: { id: true },
  })

  // Run Gemini sync. Lambat (~5-15dtk) tapi sync supaya UI bisa langsung
  // tampilkan hasil tanpa polling. Kalau di prod nantinya jadi terlalu lambat,
  // pindahkan ke async + cron poll (gambar Gemini biasanya cukup cepat).
  try {
    await enqueueAndRunImageJob({
      userId: session.user.id,
      hostTemplateId: tpl.id,
      prompt: data.promptImage,
      referenceImageUrls: data.refImageUrls,
    })
  } catch (err) {
    if (err instanceof InsufficientBalanceError) {
      return jsonError(
        `Saldo token kurang untuk generate image. Butuh ±${err.tokensRequired} token.`,
        402,
      )
    }
    // Status sudah ke FAILED di queue.ts catch — return template id supaya
    // user bisa retry / lihat error.
    return jsonError(
      `Generate image gagal: ${(err as Error).message.slice(0, 300)}`,
      500,
    )
  }

  return jsonOk({ id: tpl.id })
}
