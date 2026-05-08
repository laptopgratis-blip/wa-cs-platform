// PUT /api/orders/[id]/tags — replace seluruh tag set untuk satu order.
// Body: { tagIds: string[] }
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'

const bodySchema = z.object({
  tagIds: z.array(z.string().min(1)).max(20),
})

export async function PUT(
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
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }

  const order = await prisma.userOrder.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  })
  if (!order) return jsonError('Pesanan tidak ditemukan', 404)

  // Verify tag-tag itu milik user (bukan tag user lain) supaya ga bocor
  // cross-tenant.
  const validTagIds =
    parsed.data.tagIds.length === 0
      ? []
      : (
          await prisma.orderTag.findMany({
            where: { id: { in: parsed.data.tagIds }, userId: session.user.id },
            select: { id: true },
          })
        ).map((t) => t.id)

  await prisma.userOrder.update({
    where: { id },
    data: {
      tags: {
        set: validTagIds.map((tid) => ({ id: tid })),
      },
    },
  })

  const updated = await prisma.userOrder.findUnique({
    where: { id },
    select: {
      tags: { select: { id: true, name: true, color: true } },
    },
  })

  return jsonOk({ tags: updated?.tags ?? [] })
}
