// GET  /api/order-tags — list tag user.
// POST /api/order-tags — buat tag baru.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import {
  ORDER_TAG_LIMIT_PER_USER,
  orderTagCreateSchema,
} from '@/lib/validations/order-tag'

export async function GET() {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }
  const tags = await prisma.orderTag.findMany({
    where: { userId: session.user.id },
    orderBy: [{ name: 'asc' }],
    select: {
      id: true,
      name: true,
      color: true,
      _count: { select: { orders: true } },
      createdAt: true,
    },
  })
  return jsonOk({
    items: tags.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      orderCount: t._count.orders,
    })),
    limit: ORDER_TAG_LIMIT_PER_USER,
    used: tags.length,
  })
}

export async function POST(req: Request) {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }
  const json = await req.json().catch(() => null)
  const parsed = orderTagCreateSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }

  const count = await prisma.orderTag.count({
    where: { userId: session.user.id },
  })
  if (count >= ORDER_TAG_LIMIT_PER_USER) {
    return jsonError(
      `Sudah mencapai batas ${ORDER_TAG_LIMIT_PER_USER} tag.`,
      409,
    )
  }
  try {
    const created = await prisma.orderTag.create({
      data: {
        userId: session.user.id,
        name: parsed.data.name,
        color: parsed.data.color ?? '#6B7280',
      },
    })
    return jsonOk(
      {
        id: created.id,
        name: created.name,
        color: created.color,
        orderCount: 0,
      },
      201,
    )
  } catch (err) {
    // Unique constraint userId+name.
    if (
      err instanceof Error &&
      err.message.includes('OrderTag_userId_name_key')
    ) {
      return jsonError('Tag dengan nama itu sudah ada', 409)
    }
    console.error('[POST /api/order-tags] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
