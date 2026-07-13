// GET  /api/warehouses — list gudang user.
// POST /api/warehouses — buat gudang baru. Limit per user.
//
// Plan-gate: hanya user dengan akses Order System (paket POWER).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import { regionOfProvince } from '@/lib/services/region-map'
import {
  WAREHOUSE_LIMIT_PER_USER,
  warehouseCreateSchema,
} from '@/lib/validations/warehouse'

export async function GET() {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }

  try {
    const items = await prisma.warehouse.findMany({
      where: { userId: session.user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    })
    return jsonOk({
      items: items.map((it) => ({
        ...it,
        createdAt: it.createdAt.toISOString(),
        updatedAt: it.updatedAt.toISOString(),
      })),
      limit: WAREHOUSE_LIMIT_PER_USER,
      used: items.length,
    })
  } catch (err) {
    console.error('[GET /api/warehouses] gagal:', err)
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
  const parsed = warehouseCreateSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }

  try {
    const count = await prisma.warehouse.count({
      where: { userId: session.user.id },
    })
    if (count >= WAREHOUSE_LIMIT_PER_USER) {
      return jsonError(
        `Sudah mencapai batas ${WAREHOUSE_LIMIT_PER_USER} gudang. Hapus salah satu untuk menambah baru.`,
        409,
      )
    }

    const data = parsed.data
    // Gudang pertama otomatis default; atau kalau user minta jadi default,
    // pastikan hanya 1 yang default. regionCode di-derive server-side.
    const created = await prisma.$transaction(async (tx) => {
      const wantsDefault = data.isDefault === true || count === 0
      if (wantsDefault) {
        await tx.warehouse.updateMany({
          where: { userId: session.user.id, isDefault: true },
          data: { isDefault: false },
        })
      }
      return tx.warehouse.create({
        data: {
          userId: session.user.id,
          name: data.name,
          originId: data.originId,
          cityName: data.cityName,
          provinceName: data.provinceName ?? '',
          regionCode: regionOfProvince(data.provinceName),
          isActive: data.isActive ?? true,
          isDefault: wantsDefault,
        },
      })
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
    console.error('[POST /api/warehouses] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
