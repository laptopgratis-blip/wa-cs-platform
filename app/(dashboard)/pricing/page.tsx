// /pricing — public-accessible (logged in user juga bisa lihat).
// Server component fetch packages dari DB, sisanya di-handle PricingView (client).
import { getServerSession } from 'next-auth'

import { PricingView } from '@/components/subscription/PricingView'
import { authOptions } from '@/lib/auth'
import { TIER_VISITOR_CAP } from '@/lib/lp-quota'
import { prisma } from '@/lib/prisma'
import { computeUpgradeCredit } from '@/lib/services/subscription'

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
    const [quota, balance] = await Promise.all([
      prisma.userQuota.findUnique({
        where: { userId: session.user.id },
        select: { tier: true },
      }),
      prisma.tokenBalance.findUnique({
        where: { userId: session.user.id },
        select: { balance: true },
      }),
    ])
    currentTier = quota?.tier ?? 'FREE'
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
