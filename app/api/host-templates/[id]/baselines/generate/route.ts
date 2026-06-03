// POST /api/host-templates/[id]/baselines/generate
// Trigger generate baseline videos (1-3 variants). User HARUS konfirm dulu
// karena cost ~$1.5 per variant. Submit ke Kling async, return langsung.
//
// Body: { variantKeys: ['A','B','C'] } — subset varian yang mau di-generate.

import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { generateBaselineVideos } from '@/lib/services/host-gen/queue'

const schema = z.object({
  variantKeys: z
    .array(z.enum(['A', 'B', 'C']))
    .min(1, 'Minimal 1 variant dipilih')
    .max(3),
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
    select: { userId: true, mode: true, sourceImageUrl: true },
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

  try {
    const result = await generateBaselineVideos({
      hostTemplateId: id,
      userId: host.userId,
      variantKeys: parsed.data.variantKeys,
    })
    return jsonOk({
      submitted: result.submitted,
      sceneIds: result.sceneIds,
      message: `${result.submitted} baseline submitted, tunggu ~2-3 menit per varian`,
    })
  } catch (e) {
    return jsonError((e as Error).message, 500)
  }
}
