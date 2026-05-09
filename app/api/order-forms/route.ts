// GET  /api/order-forms — list form milik user.
// POST /api/order-forms — buat form baru. Auto-generate slug unik.
import { randomBytes } from 'crypto'

import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import {
  ORDER_FORM_LIMIT_PER_USER,
  orderFormCreateSchema,
} from '@/lib/validations/order-form'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

async function generateUniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || 'form'
  for (let i = 0; i < 10; i++) {
    const suffix = randomBytes(3).toString('hex')
    const slug = `${base}-${suffix}`
    const exists = await prisma.orderForm.findUnique({ where: { slug } })
    if (!exists) return slug
  }
  // Fallback random murni kalau 10x bentrok (mustahil tapi defensive).
  return `form-${randomBytes(8).toString('hex')}`
}

export async function GET() {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }
  try {
    const items = await prisma.orderForm.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
    })
    return jsonOk({
      items: items.map((f) => ({
        ...f,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      })),
      limit: ORDER_FORM_LIMIT_PER_USER,
      used: items.length,
    })
  } catch (err) {
    console.error('[GET /api/order-forms] gagal:', err)
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
  const parsed = orderFormCreateSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }
  try {
    const count = await prisma.orderForm.count({
      where: { userId: session.user.id },
    })
    if (count >= ORDER_FORM_LIMIT_PER_USER) {
      return jsonError(
        `Sudah mencapai batas ${ORDER_FORM_LIMIT_PER_USER} form.`,
        409,
      )
    }
    const data = parsed.data
    const slug = await generateUniqueSlug(data.name)
    const created = await prisma.orderForm.create({
      data: {
        userId: session.user.id,
        slug,
        name: data.name,
        description: data.description ?? null,
        productIds: data.productIds,
        acceptCod: data.acceptCod,
        acceptTransfer: data.acceptTransfer,
        shippingFlatCod: data.shippingFlatCod ?? null,
        requireShipping: data.requireShipping,
        showFlashSaleCounter: data.showFlashSaleCounter,
        showShippingPromo: data.showShippingPromo,
        socialProofEnabled: data.socialProofEnabled,
        socialProofPosition: data.socialProofPosition,
        socialProofIntervalSec: data.socialProofIntervalSec,
        enabledPixelIds: data.enabledPixelIds,
        isActive: data.isActive,
      },
    })
    return jsonOk(
      {
        ...created,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
      201,
    )
  } catch (err) {
    console.error('[POST /api/order-forms] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
