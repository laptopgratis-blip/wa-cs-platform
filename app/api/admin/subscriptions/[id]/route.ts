// GET /api/admin/subscriptions/[id] — detail untuk admin.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, { params }: Params) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  try {
    const sub = await prisma.subscription.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, name: true } },
        lpPackage: true,
        invoices: {
          orderBy: { createdAt: 'desc' },
          include: {
            approvedByUser: { select: { id: true, email: true } },
          },
        },
      },
    })
    if (!sub) return jsonError('Subscription tidak ditemukan', 404)
    return jsonOk({
      ...sub,
      startDate: sub.startDate.toISOString(),
      endDate: sub.endDate.toISOString(),
      cancelledAt: sub.cancelledAt?.toISOString() ?? null,
      createdAt: sub.createdAt.toISOString(),
      invoices: sub.invoices.map((i) => ({
        ...i,
        createdAt: i.createdAt.toISOString(),
        paidAt: i.paidAt?.toISOString() ?? null,
        approvedAt: i.approvedAt?.toISOString() ?? null,
        expiresAt: i.expiresAt.toISOString(),
      })),
    })
  } catch (err) {
    console.error('[GET /api/admin/subscriptions/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
