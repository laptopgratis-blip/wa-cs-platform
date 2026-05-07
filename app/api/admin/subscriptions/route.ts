// GET /api/admin/subscriptions?status=ACTIVE|PENDING|EXPIRED|CANCELLED|all
//                              &expiringIn=7  (filter expiring N hari)
//                              &page=1&pageSize=50
//
// Untuk admin dashboard /admin/subscriptions. Return rich row dgn user + plan
// + invoices ringkasan supaya UI tidak perlu banyak request.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'

const VALID_STATUSES = ['ACTIVE', 'PENDING', 'EXPIRED', 'CANCELLED'] as const

export async function GET(req: Request) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }

  const url = new URL(req.url)
  const statusParam = url.searchParams.get('status') ?? 'ACTIVE'
  const expiringIn = url.searchParams.get('expiringIn')
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'))
  const pageSize = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get('pageSize') ?? '50')),
  )

  const where: Record<string, unknown> = {}
  if (statusParam !== 'all') {
    if (!(VALID_STATUSES as readonly string[]).includes(statusParam)) {
      return jsonError(`Status tidak valid: ${statusParam}`)
    }
    where.status = statusParam
  }
  if (expiringIn) {
    const days = Number(expiringIn)
    if (!Number.isFinite(days) || days < 0) {
      return jsonError('expiringIn harus angka non-negatif')
    }
    const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    where.endDate = { lte: end, gte: new Date() }
    where.status = 'ACTIVE'
  }

  try {
    const [rows, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, name: true } },
          lpPackage: { select: { name: true, tier: true } },
          invoices: {
            select: {
              id: true,
              invoiceNumber: true,
              status: true,
              amount: true,
              paymentMethod: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 3,
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.subscription.count({ where }),
    ])

    return jsonOk({
      page,
      pageSize,
      total,
      subscriptions: rows.map((s) => ({
        id: s.id,
        status: s.status,
        isLifetime: s.isLifetime,
        durationMonths: s.durationMonths,
        startDate: s.startDate.toISOString(),
        endDate: s.endDate.toISOString(),
        priceFinal: s.priceFinal,
        cancelledAt: s.cancelledAt?.toISOString() ?? null,
        user: s.user,
        plan: s.lpPackage,
        invoices: s.invoices.map((i) => ({
          ...i,
          createdAt: i.createdAt.toISOString(),
        })),
        createdAt: s.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    console.error('[GET /api/admin/subscriptions] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
