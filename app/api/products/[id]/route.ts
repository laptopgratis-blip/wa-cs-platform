// PATCH  /api/products/[id] — edit produk.
// DELETE /api/products/[id] — hapus produk + file foto kalau ada.
import { unlink } from 'fs/promises'
import path from 'path'

import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import { productUpdateSchema } from '@/lib/validations/product'

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
  const parsed = productUpdateSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }
  try {
    const existing = await prisma.product.findFirst({
      where: { id, userId: session.user.id },
    })
    if (!existing) return jsonError('Produk tidak ditemukan', 404)

    const data = parsed.data
    const updated = await prisma.product.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.price !== undefined && { price: data.price }),
        ...(data.weightGrams !== undefined && { weightGrams: data.weightGrams }),
        ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
        ...(data.stock !== undefined && { stock: data.stock }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.order !== undefined && { order: data.order }),
        ...(data.flashSaleActive !== undefined && {
          flashSaleActive: data.flashSaleActive,
        }),
        ...(data.flashSalePrice !== undefined && {
          flashSalePrice: data.flashSalePrice,
        }),
        ...(data.flashSaleStartAt !== undefined && {
          flashSaleStartAt: data.flashSaleStartAt
            ? new Date(data.flashSaleStartAt)
            : null,
        }),
        ...(data.flashSaleEndAt !== undefined && {
          flashSaleEndAt: data.flashSaleEndAt
            ? new Date(data.flashSaleEndAt)
            : null,
        }),
        ...(data.flashSaleQuota !== undefined && {
          flashSaleQuota: data.flashSaleQuota,
        }),
      },
    })
    return jsonOk({
      ...updated,
      flashSaleStartAt: updated.flashSaleStartAt?.toISOString() ?? null,
      flashSaleEndAt: updated.flashSaleEndAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    })
  } catch (err) {
    console.error('[PATCH /api/products/[id]] gagal:', err)
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
  try {
    const existing = await prisma.product.findFirst({
      where: { id, userId: session.user.id },
    })
    if (!existing) return jsonError('Produk tidak ditemukan', 404)

    await prisma.product.delete({ where: { id } })

    // Hapus file foto best-effort (tidak fatal kalau gagal).
    if (existing.imageUrl?.startsWith('/uploads/products/')) {
      const filePath = path.join(
        process.cwd(),
        'public',
        existing.imageUrl.replace(/^\//, ''),
      )
      await unlink(filePath).catch(() => {})
    }

    return jsonOk({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/products/[id]] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
