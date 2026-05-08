// PATCH  /api/products/[id] — edit produk.
// DELETE /api/products/[id] — hapus produk + file foto kalau ada.
import { unlink } from 'fs/promises'
import path from 'path'

import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import { productUpdateSchema } from '@/lib/validations/product'

// Hapus file dari /public/uploads/products/... best-effort.
async function unlinkUpload(url: string | null | undefined) {
  if (!url || !url.startsWith('/uploads/products/')) return
  const filePath = path.join(process.cwd(), 'public', url.replace(/^\//, ''))
  await unlink(filePath).catch(() => {})
}

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
      include: { variants: { select: { id: true } } },
    })
    if (!existing) return jsonError('Produk tidak ditemukan', 404)

    const data = parsed.data

    // Galeri sync — kalau client kirim `images`, itu sumber kebenaran.
    // Cover (imageUrl) di-derive dari images[0]. File yang dikeluarkan dari
    // galeri di-unlink supaya tidak jadi sampah di disk.
    let imageUpdate: { imageUrl?: string | null; images?: string[] } = {}
    if (data.images !== undefined) {
      const next = data.images
      const removed = existing.images.filter((u) => !next.includes(u))
      for (const u of removed) await unlinkUpload(u)
      imageUpdate = {
        images: next,
        imageUrl: next[0] ?? null,
      }
    } else if (data.imageUrl !== undefined) {
      // Backwards compat — kalau client lama hanya kirim imageUrl, sync ke images.
      imageUpdate = {
        imageUrl: data.imageUrl,
        images: data.imageUrl ? [data.imageUrl] : [],
      }
      // Hapus foto lama yang tidak match dengan imageUrl baru.
      for (const u of existing.images) {
        if (u !== data.imageUrl) await unlinkUpload(u)
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Update field utama produk.
      await tx.product.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.price !== undefined && { price: data.price }),
          ...(data.weightGrams !== undefined && { weightGrams: data.weightGrams }),
          ...imageUpdate,
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

      // 2. Sync varian — full replace strategy.
      // Kalau client kirim `variants` (bisa empty array), kita anggap itu
      // sumber kebenaran: delete varian yang tidak ada di payload, update
      // yang match by id, create yang tanpa id.
      if (data.variants !== undefined) {
        const incomingIds = new Set(
          data.variants.filter((v) => v.id).map((v) => v.id as string),
        )
        const existingIds = existing.variants.map((v) => v.id)
        // Delete varian yang dihapus dari UI.
        const toDelete = existingIds.filter((vid) => !incomingIds.has(vid))
        if (toDelete.length > 0) {
          await tx.productVariant.deleteMany({
            where: { id: { in: toDelete }, productId: id },
          })
        }
        // Upsert satu-satu (Prisma tidak punya `upsertMany`).
        for (let idx = 0; idx < data.variants.length; idx++) {
          const v = data.variants[idx]
          const payload = {
            name: v.name,
            sku: v.sku ?? null,
            price: v.price,
            weightGrams: v.weightGrams,
            stock: v.stock ?? null,
            imageUrl: v.imageUrl ?? null,
            isActive: v.isActive ?? true,
            sortOrder: v.sortOrder ?? idx,
          }
          if (v.id && existingIds.includes(v.id)) {
            await tx.productVariant.update({
              where: { id: v.id },
              data: payload,
            })
          } else {
            await tx.productVariant.create({
              data: { ...payload, productId: id },
            })
          }
        }
      }

      // 3. Re-fetch dengan varian fresh untuk response.
      return tx.product.findUniqueOrThrow({
        where: { id },
        include: {
          variants: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        },
      })
    })

    return jsonOk({
      ...updated,
      flashSaleStartAt: updated.flashSaleStartAt?.toISOString() ?? null,
      flashSaleEndAt: updated.flashSaleEndAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      variants: updated.variants.map((v) => ({
        ...v,
        createdAt: v.createdAt.toISOString(),
        updatedAt: v.updatedAt.toISOString(),
      })),
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
      include: { variants: { select: { imageUrl: true } } },
    })
    if (!existing) return jsonError('Produk tidak ditemukan', 404)

    // Cascade ke varian via Prisma onDelete: Cascade.
    await prisma.product.delete({ where: { id } })

    // Hapus file foto produk + galeri + foto varian best-effort.
    const imageUrls = [
      existing.imageUrl,
      ...existing.images,
      ...existing.variants.map((v) => v.imageUrl),
    ]
    for (const url of imageUrls) await unlinkUpload(url)

    return jsonOk({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/products/[id]] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
