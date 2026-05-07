// GET /api/orders — list pesanan user dengan filter tab/search/dateRange.
//
// Query params:
//   tab        : all|pending|paid|shipped|completed (default: all)
//   q          : search di customerName/customerPhone/notes (case-insensitive)
//   from, to   : ISO date string — filter berdasarkan createdAt
//   limit      : max 200, default 100
//
// Response juga sertakan `counts` per tab supaya UI tab badge bisa render
// tanpa fetch tambahan.
import type { Prisma } from '@prisma/client'
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import type { OrderTab } from '@/lib/validations/order'

function buildTabFilter(tab: OrderTab): Prisma.UserOrderWhereInput {
  switch (tab) {
    case 'pending':
      return { paymentStatus: 'PENDING' }
    case 'paid':
      return {
        paymentStatus: 'PAID',
        deliveryStatus: { notIn: ['DELIVERED', 'CANCELLED'] },
      }
    case 'shipped':
      return { deliveryStatus: 'SHIPPED' }
    case 'completed':
      return { deliveryStatus: 'DELIVERED' }
    case 'all':
    default:
      return {}
  }
}

function parseTab(value: string | null): OrderTab {
  switch (value) {
    case 'pending':
    case 'paid':
    case 'shipped':
    case 'completed':
      return value
    default:
      return 'all'
  }
}

export async function GET(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const url = new URL(req.url)
  const tab = parseTab(url.searchParams.get('tab'))
  const q = (url.searchParams.get('q') ?? '').trim()
  const fromRaw = url.searchParams.get('from')
  const toRaw = url.searchParams.get('to')
  const limit = Math.min(
    Math.max(Number(url.searchParams.get('limit') ?? 100), 1),
    200,
  )

  try {
    const baseWhere: Prisma.UserOrderWhereInput = {
      userId: session.user.id,
    }
    if (q) {
      baseWhere.OR = [
        { customerName: { contains: q, mode: 'insensitive' } },
        { customerPhone: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
      ]
    }
    const dateRange: Prisma.DateTimeFilter = {}
    if (fromRaw) {
      const d = new Date(fromRaw)
      if (!Number.isNaN(d.getTime())) dateRange.gte = d
    }
    if (toRaw) {
      const d = new Date(toRaw)
      if (!Number.isNaN(d.getTime())) dateRange.lte = d
    }
    if (Object.keys(dateRange).length > 0) {
      baseWhere.createdAt = dateRange
    }

    const where: Prisma.UserOrderWhereInput = {
      ...baseWhere,
      ...buildTabFilter(tab),
    }

    // Hitung counts per tab untuk render badge — pakai baseWhere yang sama
    // (q + dateRange) supaya konsisten.
    const [orders, countAll, countPending, countPaid, countShipped, countCompleted] =
      await Promise.all([
        prisma.userOrder.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: {
            id: true,
            customerName: true,
            customerPhone: true,
            customerAddress: true,
            items: true,
            totalAmount: true,
            paymentMethod: true,
            paymentStatus: true,
            deliveryStatus: true,
            trackingNumber: true,
            flowName: true,
            notes: true,
            contactId: true,
            createdAt: true,
            updatedAt: true,
            // E-commerce fields (Phase 3)
            invoiceNumber: true,
            paymentProofUrl: true,
            shippingCourier: true,
            shippingService: true,
            shippingCityName: true,
            shippingProvinceName: true,
            subtotalRp: true,
            flashSaleDiscountRp: true,
            shippingCostRp: true,
            shippingSubsidyRp: true,
            appliedZoneName: true,
            totalRp: true,
            uniqueCode: true,
            // Pixel tracking (Phase 3 Pixel) — kapan event sukses fire,
            // dipakai untuk badge status di UI.
            pixelLeadFiredAt: true,
            pixelPurchaseFiredAt: true,
          },
        }),
        prisma.userOrder.count({ where: baseWhere }),
        prisma.userOrder.count({
          where: { ...baseWhere, ...buildTabFilter('pending') },
        }),
        prisma.userOrder.count({
          where: { ...baseWhere, ...buildTabFilter('paid') },
        }),
        prisma.userOrder.count({
          where: { ...baseWhere, ...buildTabFilter('shipped') },
        }),
        prisma.userOrder.count({
          where: { ...baseWhere, ...buildTabFilter('completed') },
        }),
      ])

    return jsonOk({
      orders: orders.map((o) => ({
        ...o,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
      })),
      counts: {
        all: countAll,
        pending: countPending,
        paid: countPaid,
        shipped: countShipped,
        completed: countCompleted,
      },
    })
  } catch (err) {
    console.error('[GET /api/orders] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
