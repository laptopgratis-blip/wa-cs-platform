// Plan gating untuk Order System (Phase 1, 2026-05-07).
// Akses fitur (Produk, Form Order, Zona Ongkir, Rekening) hanya untuk user
// dengan subscription ACTIVE pada LpUpgradePackage yang `canUseOrderSystem`.
// Sejak 2026-07-05: POPULAR dan POWER (flag di DB, bisa diubah admin).
import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/api'
import { TIER_RANK } from '@/lib/services/subscription'
import { resolveOrderFormLimit } from '@/lib/validations/order-form'

export interface OrderSystemAccess {
  hasAccess: boolean
  currentTier: string  // FREE | STARTER | POPULAR | POWER
  requiredTier: 'POPULAR'
  packageName?: string
  expiresAt?: Date | null
}

// Cek apakah user boleh akses Order System. Tidak throw — caller boleh
// render UpgradeModal kalau hasAccess=false.
//
// Basis: subscription HIDUP (ACTIVE, atau CANCELLED yang belum lewat
// endDate — janji cancel = akses jalan sampai endDate). Tidak lagi membaca
// pointer User.currentSubscriptionId yang bisa basi saat sub dobel/expire
// parsial.
//
// ADMIN bypass: role=ADMIN selalu hasAccess=true (untuk testing + ops),
// supaya admin Hulao bisa lihat & test semua fitur Order System tanpa harus
// subscribe ke paket POWER duluan.
export async function checkOrderSystemAccess(
  userId: string,
): Promise<OrderSystemAccess> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  })

  if (user?.role === 'ADMIN') {
    return {
      hasAccess: true,
      currentTier: 'ADMIN',
      requiredTier: 'POPULAR',
      packageName: 'Admin Bypass',
    }
  }

  const liveSubs = await prisma.subscription.findMany({
    where: {
      userId,
      status: { in: ['ACTIVE', 'CANCELLED'] },
      OR: [{ isLifetime: true }, { endDate: { gt: new Date() } }],
    },
    select: {
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

  if (liveSubs.length === 0) {
    return { hasAccess: false, currentTier: 'FREE', requiredTier: 'POPULAR' }
  }

  // currentTier = rank tertinggi lintas sub hidup (untuk pesan UpgradeModal).
  const top = liveSubs.reduce((a, b) =>
    (TIER_RANK[b.lpPackage.tier] ?? 0) > (TIER_RANK[a.lpPackage.tier] ?? 0)
      ? b
      : a,
  )
  // Akses diberikan kalau ADA paket hidup ber-flag canUseOrderSystem;
  // expiresAt = endDate terjauh dari sub yang meng-grant akses tsb.
  const granting = liveSubs
    .filter((s) => s.lpPackage.canUseOrderSystem)
    .sort((a, b) => b.endDate.getTime() - a.endDate.getTime())

  if (granting.length === 0) {
    return {
      hasAccess: false,
      currentTier: top.lpPackage.tier,
      requiredTier: 'POPULAR',
      packageName: top.lpPackage.name,
    }
  }

  return {
    hasAccess: true,
    currentTier: top.lpPackage.tier,
    requiredTier: 'POPULAR',
    packageName: granting[0].lpPackage.name,
    expiresAt: granting[0].endDate,
  }
}

// Limit form order per user. Dihitung dari TIER EFEKTIF (UserQuota.tier —
// sudah termasuk floor grandfather legacyTier), BUKAN currentTier sub hidup,
// supaya konsisten dengan tier yang user lihat di billing: user legacy-POWER
// dengan sub POPULAR hidup tetap dapat unlimited. Akses Order System sendiri
// tetap berbasis sub hidup (checkOrderSystemAccess di atas).
export async function getOrderFormLimit(
  userId: string,
  currentTier: string,
): Promise<number | null> {
  if (currentTier === 'ADMIN') return null
  const quota = await prisma.userQuota.findUnique({
    where: { userId },
    select: { tier: true },
  })
  return resolveOrderFormLimit(quota?.tier ?? currentTier)
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
        error: 'forbidden — butuh paket POPULAR ke atas untuk fitur Order System',
        code: 'ORDER_SYSTEM_ACCESS_REQUIRED',
        currentTier: access.currentTier,
        requiredTier: access.requiredTier,
      },
      { status: 403 },
    )
  }

  return { session, access }
}
