// /pricing — public-accessible (logged in user juga bisa lihat).
// Server component fetch packages dari DB, sisanya di-handle PricingView (client).
import { getServerSession } from 'next-auth'

import { PricingView } from '@/components/subscription/PricingView'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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

  // Plan badge utk current user — supaya CTA bisa beda kalau sudah subscribe.
  let currentTier: string | null = null
  let currentBalance: number | null = null
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
  }

  // pricePerToken aktif — dipakai PricingView untuk hitung token equivalent
  // di tiap kartu plan. Default Rp 2/token kalau setting belum ada.
  const settings = await prisma.pricingSettings
    .findFirst({ select: { pricePerToken: true } })
    .catch(() => null)
  const pricePerToken = settings?.pricePerToken ?? 2

  return (
    <PricingView
      packages={packages}
      isLoggedIn={Boolean(session)}
      currentTier={currentTier}
      currentBalance={currentBalance}
      pricePerToken={pricePerToken}
    />
  )
}
