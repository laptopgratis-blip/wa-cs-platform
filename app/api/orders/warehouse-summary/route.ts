// GET /api/orders/warehouse-summary
// Ringkasan pesanan "perlu dikemas" per gudang — untuk strip fulfillment di
// /pesanan. "Perlu dikemas" = deliveryStatus PENDING & paymentStatus ≠ CANCELLED
// (sudah masuk & belum dikirim). Ringan: 1 groupBy + 1 list gudang.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { readyToPackWhere } from '@/lib/order-fulfillment'
import { prisma } from '@/lib/prisma'

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  try {
    const userId = session.user.id
    const fulfillWhere = readyToPackWhere(userId)
    const [warehouses, grouped] = await Promise.all([
      prisma.warehouse.findMany({
        where: { userId },
        select: { id: true, name: true, isActive: true },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      }),
      prisma.userOrder.groupBy({
        by: ['warehouseId'],
        where: fulfillWhere,
        _count: { _all: true },
      }),
    ])

    const countByWh = new Map<string | null, number>()
    for (const g of grouped) countByWh.set(g.warehouseId, g._count._all)

    const items = warehouses.map((w) => ({
      warehouseId: w.id,
      name: w.name,
      isActive: w.isActive,
      count: countByWh.get(w.id) ?? 0,
    }))
    const noneCount = countByWh.get(null) ?? 0
    const total = items.reduce((s, i) => s + i.count, 0) + noneCount

    return jsonOk({ warehouses: items, noneCount, total })
  } catch (err) {
    console.error('[GET /api/orders/warehouse-summary] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
