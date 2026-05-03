// /landing-pages/upgrade — pilih paket upgrade Landing Page.
import { ArrowLeft } from 'lucide-react'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { LpUpgradePicker } from '@/components/lp/LpUpgradePicker'
import { Button } from '@/components/ui/button'
import { authOptions } from '@/lib/auth'
import { getUserQuota } from '@/lib/lp-quota'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function UpgradeLpPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const [packages, quota] = await Promise.all([
    prisma.lpUpgradePackage.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    }),
    getUserQuota(session.user.id),
  ])

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 overflow-y-auto p-4 md:p-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
          <Link href="/landing-pages">
            <ArrowLeft className="mr-2 size-4" />
            Kembali ke Landing Page
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
          Upgrade Landing Page
        </h1>
        <p className="mt-1 text-sm text-warm-500">
          Kamu sekarang di paket{' '}
          <span className="font-semibold text-warm-900">{quota.tier}</span> —{' '}
          {quota.maxLp >= 999 ? '∞ LP' : `${quota.maxLp} LP`},{' '}
          {quota.maxStorageMB} MB storage. Pilih paket di bawah untuk menambah
          kuota.
        </p>
      </div>

      <LpUpgradePicker
        currentTier={quota.tier}
        packages={packages.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          tier: p.tier,
          maxLp: p.maxLp,
          maxStorageMB: p.maxStorageMB,
          price: p.price,
          isPopular: p.isPopular,
        }))}
      />
    </div>
  )
}
