// PATCH  /api/warehouses/[id] — edit gudang (nama, origin, status, default).
// DELETE /api/warehouses/[id] — hapus gudang; promote gudang lain jadi default
//                                kalau yang dihapus adalah default.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import { regionOfProvince } from '@/lib/services/region-map'
import { warehouseUpdateSchema } from '@/lib/validations/warehouse'

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
  const parsed = warehouseUpdateSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }

  try {
    const existing = await prisma.warehouse.findFirst({
      where: { id, userId: session.user.id },
    })
    if (!existing) return jsonError('Gudang tidak ditemukan', 404)

    const data = parsed.data
    const updated = await prisma.$transaction(async (tx) => {
      if (data.isDefault === true) {
        await tx.warehouse.updateMany({
          where: {
            userId: session.user.id,
            isDefault: true,
            id: { not: id },
          },
          data: { isDefault: false },
        })
      }
      return tx.warehouse.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.originId !== undefined && { originId: data.originId }),
          ...(data.cityName !== undefined && { cityName: data.cityName }),
          // provinceName berubah → regionCode wajib ikut di-derive ulang.
          ...(data.provinceName !== undefined && {
            provinceName: data.provinceName,
            regionCode: regionOfProvince(data.provinceName),
          }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
          ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
        },
      })
    })

    return jsonOk({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    })
  } catch (err) {
    console.error('[PATCH /api/warehouses/[id]] gagal:', err)
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
    const existing = await prisma.warehouse.findFirst({
      where: { id, userId: session.user.id },
    })
    if (!existing) return jsonError('Gudang tidak ditemukan', 404)

    await prisma.$transaction(async (tx) => {
      await tx.warehouse.delete({ where: { id } })
      // Kalau yang dihapus default, promote gudang aktif lain jadi default
      // supaya selalu ada satu default (kalau masih ada gudang tersisa).
      if (existing.isDefault) {
        const next = await tx.warehouse.findFirst({
          where: { userId: session.user.id, isActive: true },
          orderBy: { createdAt: 'asc' },
        })
        if (next) {
          await tx.warehouse.update({
            where: { id: next.id },
            data: { isDefault: true },
          })
        }
      }
    })

    return jsonOk({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/warehouses/[id]] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
