// /pricing — butuh login (layout (dashboard) redirect anonim ke /login;
// PricingView sendiri sudah isLoggedIn-aware kalau nanti mau dibuat publik).
// Server component fetch packages dari DB, sisanya di-handle PricingView (client).
import { getServerSession } from 'next-auth'

import { PricingView } from '@/components/subscription/PricingView'
import { authOptions } from '@/lib/auth'
import { TIER_VISITOR_CAP } from '@/lib/lp-quota'
import { prisma } from '@/lib/prisma'
import { TIER_RANK, computeUpgradeCredit } from '@/lib/services/subscription'

export const dynamic = 'force-dynamic'

export default async function PricingPage() {
  const session = await getServerSession(authOptions)

  // Ambil semua package aktif yg sudah punya priceMonthly > 0 — yg eligible
  // untuk subscription. Plus selalu tampilkan FREE sebagai card pertama.
  const packages = await prisma.lpUpgradePackage.findMany({
    where: { isActive: true, priceMonthly: { gt: 0 } },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      description: true,
      tier: true,
      maxLp: true,
      maxStorageMB: true,
      priceMonthly: true,
      isPopular: true,
    },
  })

  // pricePerToken aktif — dipakai PricingView untuk hitung token equivalent
  // di tiap kartu plan. Default Rp 2/token kalau setting belum ada.
  const settings = await prisma.pricingSettings
    .findFirst({ select: { pricePerToken: true } })
    .catch(() => null)
  const pricePerToken = settings?.pricePerToken ?? 2

  // Plan badge utk current user — supaya CTA bisa beda kalau sudah subscribe.
  let currentTier: string | null = null
  let currentBalance: number | null = null
  // Kredit proration per tier target (sisa subscription aktif tier lebih
  // rendah) — supaya badge "saldo cukup/kurang" di kartu pakai angka yang
  // sama dengan preview & checkout.
  const upgradeCredits: Record<string, number> = {}
  if (session) {
    // "Plan saat ini" HARUS dari subscription aktif (sumber yang sama dengan
    // PlanBadge topbar, preview, dan checkout) — BUKAN UserQuota.tier.
    // UserQuota.tier bisa lebih tinggi dari plan karena naik otomatis dari
    // akumulasi top-up token (lib/lp-quota.ts) — kasus 2026-07-14: quota
    // POWER dari top-up 750K token, sub aktif POPULAR → tombol Power terkunci
    // "Plan Saat Ini" padahal user justru mau upgrade ke Power.
    const [activeSubs, balance] = await Promise.all([
      prisma.subscription.findMany({
        where: {
          userId: session.user.id,
          // CANCELLED tetap punya akses sampai endDate (mirror /api/subscription/current).
          status: { in: ['ACTIVE', 'CANCELLED'] },
          OR: [{ isLifetime: true }, { endDate: { gt: new Date() } }],
        },
        select: { lpPackage: { select: { tier: true } } },
      }),
      prisma.tokenBalance.findUnique({
        where: { userId: session.user.id },
        select: { balance: true },
      }),
    ])
    // Bisa ada >1 sub aktif (data era pra-REPLACED) — pakai tier tertinggi.
    currentTier = activeSubs.reduce<string>(
      (top, sub) =>
        (TIER_RANK[sub.lpPackage.tier] ?? 0) > (TIER_RANK[top] ?? 0)
          ? sub.lpPackage.tier
          : top,
      'FREE',
    )
    currentBalance = balance?.balance ?? 0

    const tiers = Array.from(new Set(packages.map((p) => p.tier)))
    const credits = await Promise.all(
      tiers.map((tier) =>
        computeUpgradeCredit({
          userId: session.user.id,
          targetTier: tier,
          pricePerToken,
        }),
      ),
    )
    tiers.forEach((tier, i) => {
      upgradeCredits[tier] = credits[i]?.creditTokens ?? 0
    })
  }

  return (
    <PricingView
      packages={packages}
      isLoggedIn={Boolean(session)}
      currentTier={currentTier}
      currentBalance={currentBalance}
      upgradeCredits={upgradeCredits}
      pricePerToken={pricePerToken}
      visitorCap={TIER_VISITOR_CAP}
    />
  )
}
