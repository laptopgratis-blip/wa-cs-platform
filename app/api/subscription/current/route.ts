// GET /api/subscription/current — info subscription aktif user yg login.
// Return null kalau user belum punya subscription (FREE plan).
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
    const sub = await prisma.subscription.findFirst({
      where: {
        userId: session.user.id,
        status: { in: ['ACTIVE', 'CANCELLED'] }, // CANCELLED tetap aktif sampai endDate
        endDate: { gt: new Date() },
      },
      include: { lpPackage: true },
      orderBy: { endDate: 'desc' },
    })

    if (!sub) {
      return jsonOk({ subscription: null })
    }

    const now = Date.now()
    const daysRemaining = Math.max(
      0,
      Math.ceil((sub.endDate.getTime() - now) / (1000 * 60 * 60 * 24)),
    )

    return jsonOk({
      subscription: {
        id: sub.id,
        status: sub.status,
        isLifetime: sub.isLifetime,
        durationMonths: sub.durationMonths,
        startDate: sub.startDate.toISOString(),
        endDate: sub.endDate.toISOString(),
        daysRemaining,
        priceFinal: sub.priceFinal,
        cancelledAt: sub.cancelledAt?.toISOString() ?? null,
        plan: {
          id: sub.lpPackage.id,
          name: sub.lpPackage.name,
          tier: sub.lpPackage.tier,
          maxLp: sub.lpPackage.maxLp,
          maxStorageMB: sub.lpPackage.maxStorageMB,
          priceMonthly: sub.lpPackage.priceMonthly,
        },
      },
    })
  } catch (err) {
    console.error('[GET /api/subscription/current] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
