// PATCH  /api/order-tags/[id] — edit nama / warna tag.
// DELETE /api/order-tags/[id] — hapus tag (cascade lepaskan dari semua order).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import { orderTagUpdateSchema } from '@/lib/validations/order-tag'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  const json = await req.json().catch(() => null)
  const parsed = orderTagUpdateSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }
  const tag = await prisma.orderTag.findFirst({
    where: { id, userId: session.user.id },
  })
  if (!tag) return jsonError('Tag tidak ditemukan', 404)

  try {
    const updated = await prisma.orderTag.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.color !== undefined && { color: parsed.data.color }),
      },
    })
    return jsonOk({
      id: updated.id,
      name: updated.name,
      color: updated.color,
    })
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.includes('OrderTag_userId_name_key')
    ) {
      return jsonError('Tag dengan nama itu sudah ada', 409)
    }
    console.error('[PATCH /api/order-tags/[id]] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  const tag = await prisma.orderTag.findFirst({
    where: { id, userId: session.user.id },
  })
  if (!tag) return jsonError('Tag tidak ditemukan', 404)
  // Cascade lewat join _OrderTags akan auto-bersihin relasi.
  await prisma.orderTag.delete({ where: { id } })
  return jsonOk({ ok: true })
}
