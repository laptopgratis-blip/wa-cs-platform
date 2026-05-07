// PATCH  /api/shipping-zones/[id] — edit zona.
// DELETE /api/shipping-zones/[id] — hapus zona.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import { shippingZoneUpdateSchema } from '@/lib/validations/shipping-zone'

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
  const parsed = shippingZoneUpdateSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }
  try {
    const existing = await prisma.shippingZone.findFirst({
      where: { id, userId: session.user.id },
    })
    if (!existing) return jsonError('Zona tidak ditemukan', 404)

    const data = parsed.data
    const updated = await prisma.shippingZone.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.matchType !== undefined && { matchType: data.matchType }),
        ...(data.cityIds !== undefined && { cityIds: data.cityIds }),
        ...(data.provinceIds !== undefined && { provinceIds: data.provinceIds }),
        ...(data.cityNames !== undefined && { cityNames: data.cityNames }),
        ...(data.provinceNames !== undefined && {
          provinceNames: data.provinceNames,
        }),
        ...(data.subsidyType !== undefined && { subsidyType: data.subsidyType }),
        ...(data.subsidyValue !== undefined && {
          subsidyValue: data.subsidyValue,
        }),
        ...(data.minimumOrder !== undefined && {
          minimumOrder: data.minimumOrder,
        }),
        ...(data.startsAt !== undefined && {
          startsAt: data.startsAt ? new Date(data.startsAt) : null,
        }),
        ...(data.endsAt !== undefined && {
          endsAt: data.endsAt ? new Date(data.endsAt) : null,
        }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.priority !== undefined && { priority: data.priority }),
      },
    })
    return jsonOk({
      ...updated,
      startsAt: updated.startsAt?.toISOString() ?? null,
      endsAt: updated.endsAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    })
  } catch (err) {
    console.error('[PATCH /api/shipping-zones/[id]] gagal:', err)
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
    const existing = await prisma.shippingZone.findFirst({
      where: { id, userId: session.user.id },
    })
    if (!existing) return jsonError('Zona tidak ditemukan', 404)
    await prisma.shippingZone.delete({ where: { id } })
    return jsonOk({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/shipping-zones/[id]] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
