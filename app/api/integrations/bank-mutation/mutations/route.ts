// GET /api/integrations/bank-mutation/mutations — list mutasi user dengan
// pagination + filter. Query params:
//   page (default 1), pageSize (default 50, max 200)
//   action: AUTO_CONFIRMED | NO_MATCH | MULTIPLE_MATCH | IGNORED | MANUAL_RESOLVED
//   type: CR | DB
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'

const VALID_ACTIONS = new Set([
  'AUTO_CONFIRMED',
  'NO_MATCH',
  'MULTIPLE_MATCH',
  'IGNORED',
  'MANUAL_RESOLVED',
])

export async function GET(req: Request) {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }

  try {
    const url = new URL(req.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
    const pageSize = Math.min(
      200,
      Math.max(1, parseInt(url.searchParams.get('pageSize') || '50', 10)),
    )
    const actionParam = url.searchParams.get('action')
    const typeParam = url.searchParams.get('type')

    const where: Record<string, unknown> = { userId: session.user.id }
    if (actionParam && VALID_ACTIONS.has(actionParam)) {
      where.matchAction = actionParam
    }
    if (typeParam === 'CR' || typeParam === 'DB') {
      where.mutationType = typeParam
    }

    const [items, total] = await Promise.all([
      prisma.bankMutation.findMany({
        where,
        orderBy: { mutationDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.bankMutation.count({ where }),
    ])

    // Lookup matchedOrder secara batch supaya bisa show invoice number tanpa
    // N+1 query. Skip kalau matchedOrderId null.
    const orderIds = items
      .map((m) => m.matchedOrderId)
      .filter((id): id is string => !!id)
    const orders = orderIds.length
      ? await prisma.userOrder.findMany({
          where: { id: { in: orderIds }, userId: session.user.id },
          select: {
            id: true,
            invoiceNumber: true,
            customerName: true,
            totalRp: true,
            paymentStatus: true,
          },
        })
      : []
    const orderMap = new Map(orders.map((o) => [o.id, o]))

    return jsonOk({
      items: items.map((m) => ({
        ...m,
        mutationDate: m.mutationDate.toISOString(),
        createdAt: m.createdAt.toISOString(),
        rawHtml: undefined, // jangan kirim ke client, terlalu besar
        matchedOrder: m.matchedOrderId ? orderMap.get(m.matchedOrderId) ?? null : null,
      })),
      page,
      pageSize,
      total,
    })
  } catch (err) {
    console.error('[GET /api/integrations/bank-mutation/mutations]', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
