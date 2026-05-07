// Plan gating untuk Order System (Phase 1, 2026-05-07).
// Akses fitur (Produk, Form Order, Zona Ongkir, Rekening) hanya untuk user
// dengan subscription ACTIVE pada LpUpgradePackage yang `canUseOrderSystem`.
// Saat ini hanya paket POWER yang true.
import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/api'

export interface OrderSystemAccess {
  hasAccess: boolean
  currentTier: string  // FREE | STARTER | POPULAR | POWER
  requiredTier: 'POWER'
  packageName?: string
  expiresAt?: Date | null
}

// Cek apakah user boleh akses Order System. Tidak throw — caller boleh
// render UpgradeModal kalau hasAccess=false.
export async function checkOrderSystemAccess(
  userId: string,
): Promise<OrderSystemAccess> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      currentSubscriptionId: true,
      currentPlanExpiresAt: true,
    },
  })

  if (!user?.currentSubscriptionId) {
    return { hasAccess: false, currentTier: 'FREE', requiredTier: 'POWER' }
  }

  const sub = await prisma.subscription.findUnique({
    where: { id: user.currentSubscriptionId },
    select: {
      status: true,
      endDate: true,
      lpPackage: {
        select: {
          name: true,
          tier: true,
          canUseOrderSystem: true,
        },
      },
    },
  })

  if (!sub || sub.status !== 'ACTIVE') {
    return { hasAccess: false, currentTier: 'FREE', requiredTier: 'POWER' }
  }

  return {
    hasAccess: sub.lpPackage.canUseOrderSystem,
    currentTier: sub.lpPackage.tier,
    requiredTier: 'POWER',
    packageName: sub.lpPackage.name,
    expiresAt: sub.endDate,
  }
}

// Versi strict untuk API routes — throw 403 dengan body yang konsisten kalau
// user tidak punya akses. Pakai pattern requireSession/requireAdmin dari lib/api.
export async function requireOrderSystemAccess() {
  const session = await requireSession()
  const access = await checkOrderSystemAccess(session.user.id)

  if (!access.hasAccess) {
    throw NextResponse.json(
      {
        success: false,
        error: 'forbidden — butuh paket POWER untuk fitur Order System',
        code: 'ORDER_SYSTEM_ACCESS_REQUIRED',
        currentTier: access.currentTier,
        requiredTier: access.requiredTier,
      },
      { status: 403 },
    )
  }

  return { session, access }
}
