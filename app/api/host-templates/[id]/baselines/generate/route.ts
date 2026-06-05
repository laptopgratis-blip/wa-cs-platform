// POST /api/host-templates/[id]/baselines/generate
// Trigger generate baseline videos. User HARUS konfirm dulu karena cost
// ~$1.5 per baseline. Submit ke Kling async, return langsung.
//
// Body (salah satu):
//   { customBaselines: [{ name, category, motionScript }] } — hasil edit composer
//   { variantKeys: ['A','B','C'] } — legacy preset hardcoded

import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { generateBaselineVideos } from '@/lib/services/host-gen/queue'

const schema = z
  .object({
    // Legacy: pakai preset hardcoded A/B/C.
    variantKeys: z.array(z.enum(['A', 'B', 'C'])).min(1).max(3).optional(),
    // Custom: motion script hasil edit di composer (any number).
    customBaselines: z
      .array(
        z.object({
          name: z.string().trim().min(1, 'Nama baseline wajib').max(120),
          category: z.enum(['idle', 'greeting', 'product']),
          motionScript: z
            .string()
            .trim()
            .min(10, 'Motion script minimal 10 karakter')
            .max(4000),
        }),
      )
      .min(1)
      .max(8)
      .optional(),
  })
  .refine(
    (d) =>
      (d.variantKeys && d.variantKeys.length > 0) ||
      (d.customBaselines && d.customBaselines.length > 0),
    { message: 'Pilih variant preset atau isi minimal 1 baseline custom' },
  )

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
      customBaselines: parsed.data.customBaselines,
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
