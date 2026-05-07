// GET /api/subscription/history — semua subscription user.
// Pakai untuk tampilan history pembayaran di /billing/subscription.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  try {
    const subs = await prisma.subscription.findMany({
      where: { userId: session.user.id },
      include: {
        lpPackage: { select: { name: true, tier: true } },
        invoices: {
          select: {
            id: true,
            invoiceNumber: true,
            amount: true,
            status: true,
            paymentMethod: true,
            paidAt: true,
            createdAt: true,
            paymentUrl: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return jsonOk({
      subscriptions: subs.map((s) => ({
        id: s.id,
        status: s.status,
        durationMonths: s.durationMonths,
        isLifetime: s.isLifetime,
        startDate: s.startDate.toISOString(),
        endDate: s.endDate.toISOString(),
        priceBase: s.priceBase,
        discountPct: s.discountPct,
        priceFinal: s.priceFinal,
        plan: s.lpPackage,
        cancelledAt: s.cancelledAt?.toISOString() ?? null,
        invoices: s.invoices.map((i) => ({
          ...i,
          paidAt: i.paidAt?.toISOString() ?? null,
          createdAt: i.createdAt.toISOString(),
        })),
        createdAt: s.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    console.error('[GET /api/subscription/history] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
