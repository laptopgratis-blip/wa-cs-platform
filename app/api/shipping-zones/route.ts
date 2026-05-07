// GET  /api/shipping-zones — list zona ongkir milik user.
// POST /api/shipping-zones — buat zona baru. Limit 30 per user.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import {
  SHIPPING_ZONE_LIMIT_PER_USER,
  shippingZoneCreateSchema,
} from '@/lib/validations/shipping-zone'

export async function GET() {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }
  try {
    const items = await prisma.shippingZone.findMany({
      where: { userId: session.user.id },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    })
    return jsonOk({
      items: items.map((z) => ({
        ...z,
        startsAt: z.startsAt?.toISOString() ?? null,
        endsAt: z.endsAt?.toISOString() ?? null,
        createdAt: z.createdAt.toISOString(),
        updatedAt: z.updatedAt.toISOString(),
      })),
      limit: SHIPPING_ZONE_LIMIT_PER_USER,
      used: items.length,
    })
  } catch (err) {
    console.error('[GET /api/shipping-zones] gagal:', err)
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
  const parsed = shippingZoneCreateSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }
  try {
    const count = await prisma.shippingZone.count({
      where: { userId: session.user.id },
    })
    if (count >= SHIPPING_ZONE_LIMIT_PER_USER) {
      return jsonError(
        `Sudah mencapai batas ${SHIPPING_ZONE_LIMIT_PER_USER} zona.`,
        409,
      )
    }
    const data = parsed.data
    const created = await prisma.shippingZone.create({
      data: {
        userId: session.user.id,
        name: data.name,
        matchType: data.matchType,
        cityIds: data.cityIds,
        provinceIds: data.provinceIds,
        cityNames: data.cityNames,
        provinceNames: data.provinceNames,
        subsidyType: data.subsidyType,
        subsidyValue: data.subsidyValue,
        minimumOrder: data.minimumOrder ?? null,
        startsAt: data.startsAt ? new Date(data.startsAt) : null,
        endsAt: data.endsAt ? new Date(data.endsAt) : null,
        isActive: data.isActive,
        priority: data.priority,
      },
    })
    return jsonOk(
      {
        ...created,
        startsAt: created.startsAt?.toISOString() ?? null,
        endsAt: created.endsAt?.toISOString() ?? null,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
      201,
    )
  } catch (err) {
    console.error('[POST /api/shipping-zones] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
