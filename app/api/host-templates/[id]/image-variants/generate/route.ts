// POST /api/host-templates/[id]/image-variants/generate
// Generate gambar kandidat TAMBAHAN via Gemini (tidak mengganggu sourceImageUrl
// aktif). Body: { withProduct: boolean, prompt?: string }.
//   - prompt default = host.promptImage (editable di UI).
//   - withProduct=false → ref produk tidak dikirim + directive "tangan kosong".
// Charge 1 IMAGE unit (executeMediaSync). Sinkron (~5-15dtk), return variant.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { generateImageVariant } from '@/lib/services/host-gen/queue'
import { InsufficientBalanceError } from '@/lib/services/media-charge'

const bodySchema = z.object({
  withProduct: z.boolean().default(false),
  prompt: z.string().trim().min(10).max(2000).optional(),
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
    select: { id: true, userId: true, promptImage: true, refImageUrls: true },
  })
  if (!host) return jsonError('Host template tidak ditemukan', 404)
  if (session.user.role !== 'ADMIN' && host.userId !== session.user.id) {
    return jsonError('Tidak punya akses ke host ini', 403)
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid', 400)
  }

  try {
    const variant = await generateImageVariant({
      userId: host.userId,
      hostTemplateId: host.id,
      prompt: parsed.data.prompt ?? host.promptImage,
      referenceImageUrls: host.refImageUrls,
      withProduct: parsed.data.withProduct,
    })
    return jsonOk({ variant })
  } catch (err) {
    if (err instanceof InsufficientBalanceError) {
      return jsonError(
        `Saldo token kurang untuk generate gambar. Butuh ±${err.tokensRequired} token.`,
        402,
      )
    }
    return jsonError(
      `Generate gambar gagal: ${(err as Error).message.slice(0, 300)}`,
      500,
    )
  }
}
