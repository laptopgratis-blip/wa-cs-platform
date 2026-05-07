// GET  /api/products — list semua produk milik user (urut order asc, createdAt desc).
// POST /api/products — buat produk baru. Limit 100 per user.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import {
  PRODUCT_LIMIT_PER_USER,
  productCreateSchema,
} from '@/lib/validations/product'

export async function GET() {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }
  try {
    const items = await prisma.product.findMany({
      where: { userId: session.user.id },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    })
    return jsonOk({
      items: items.map((p) => ({
        ...p,
        flashSaleStartAt: p.flashSaleStartAt?.toISOString() ?? null,
        flashSaleEndAt: p.flashSaleEndAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      limit: PRODUCT_LIMIT_PER_USER,
      used: items.length,
    })
  } catch (err) {
    console.error('[GET /api/products] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function POST(req: Request) {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }
  const json = await req.json().catch(() => null)
  const parsed = productCreateSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }
  try {
    const count = await prisma.product.count({
      where: { userId: session.user.id },
    })
    if (count >= PRODUCT_LIMIT_PER_USER) {
      return jsonError(
        `Sudah mencapai batas ${PRODUCT_LIMIT_PER_USER} produk. Hapus yang tidak terpakai untuk menambah baru.`,
        409,
      )
    }
    const data = parsed.data
    const created = await prisma.product.create({
      data: {
        userId: session.user.id,
        name: data.name,
        description: data.description ?? null,
        price: data.price,
        weightGrams: data.weightGrams,
        imageUrl: data.imageUrl ?? null,
        stock: data.stock ?? null,
        isActive: data.isActive ?? true,
        order: data.order ?? count,
        flashSaleActive: data.flashSaleActive ?? false,
        flashSalePrice: data.flashSalePrice ?? null,
        flashSaleStartAt: data.flashSaleStartAt
          ? new Date(data.flashSaleStartAt)
          : null,
        flashSaleEndAt: data.flashSaleEndAt
          ? new Date(data.flashSaleEndAt)
          : null,
        flashSaleQuota: data.flashSaleQuota ?? null,
      },
    })
    return jsonOk(
      {
        ...created,
        flashSaleStartAt: created.flashSaleStartAt?.toISOString() ?? null,
        flashSaleEndAt: created.flashSaleEndAt?.toISOString() ?? null,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
      201,
    )
  } catch (err) {
    console.error('[POST /api/products] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
