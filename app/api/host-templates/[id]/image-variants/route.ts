// GET   /api/host-templates/[id]/image-variants — list kandidat gambar host.
//   Auto-backfill: kalau sourceImageUrl ada tapi belum tercatat, disisipkan.
// PATCH /api/host-templates/[id]/image-variants — { action, variantId }
//   action='activate' → jadikan sourceImageUrl aktif (+ invalidasi vision/scene).
//   action='delete'   → hapus kandidat (tak boleh yg sedang aktif).
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { ensureSourceInVariants } from '@/lib/services/host-gen/image-variants'
import {
  activateImageVariant,
  deleteImageVariant,
} from '@/lib/services/host-gen/queue'

async function loadOwnedHost(id: string, userId: string, isAdmin: boolean) {
  const host = await prisma.hostTemplate.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      sourceImageUrl: true,
      imageVariants: true,
      promptImage: true,
    },
  })
  if (!host) return { error: jsonError('Host template tidak ditemukan', 404) }
  if (!isAdmin && host.userId !== userId) {
    return { error: jsonError('Tidak punya akses ke host ini', 403) }
  }
  return { host }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  const { host, error } = await loadOwnedHost(
    id,
    session.user.id,
    session.user.role === 'ADMIN',
  )
  if (error) return error

  const variants = await ensureSourceInVariants(host!)
  return jsonOk({
    variants,
    activeUrl: host!.sourceImageUrl,
    promptImage: host!.promptImage,
  })
}

const patchSchema = z.object({
  action: z.enum(['activate', 'delete']),
  variantId: z.string().min(1),
})

export async function PATCH(
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
  const { host, error } = await loadOwnedHost(
    id,
    session.user.id,
    session.user.role === 'ADMIN',
  )
  if (error) return error

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid', 400)
  }

  try {
    if (parsed.data.action === 'activate') {
      const result = await activateImageVariant(host!.id, parsed.data.variantId)
      return jsonOk(result)
    }
    const variants = await deleteImageVariant({
      hostTemplateId: host!.id,
      variantId: parsed.data.variantId,
    })
    return jsonOk({ variants })
  } catch (e) {
    return jsonError((e as Error).message, 400)
  }
}
