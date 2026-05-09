// /upgrade?plan=<lpPackageId>&duration=<months>
// Server-side validate query, fetch package + bank account, render UpgradeView.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { UpgradeView } from '@/components/subscription/UpgradeView'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { VALID_DURATIONS } from '@/lib/subscription-pricing'

export const dynamic = 'force-dynamic'

interface SearchParams {
  searchParams: Promise<{ plan?: string; duration?: string }>
}

export default async function UpgradePage({ searchParams }: SearchParams) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login?callbackUrl=/upgrade')

  const sp = await searchParams
  if (!sp.plan) redirect('/pricing')

  const pkg = await prisma.lpUpgradePackage.findUnique({
    where: { id: sp.plan },
  })
  if (!pkg || !pkg.isActive || pkg.priceMonthly <= 0) {
    redirect('/pricing')
  }

  const initialDuration = sp.duration ? Number(sp.duration) : 1
  const validDuration = VALID_DURATIONS.includes(initialDuration)
    ? initialDuration
    : 1

  // Subscription DI-BAYAR DENGAN TOKEN — bank account tidak relevan lagi
  // di flow checkout. (Bank account tetap ada di /billing untuk top-up token.)
  return (
    <UpgradeView
      pkg={{
        id: pkg.id,
        name: pkg.name,
        tier: pkg.tier,
        description: pkg.description,
        maxLp: pkg.maxLp,
        maxStorageMB: pkg.maxStorageMB,
        priceMonthly: pkg.priceMonthly,
      }}
      initialDuration={validDuration}
    />
  )
}
