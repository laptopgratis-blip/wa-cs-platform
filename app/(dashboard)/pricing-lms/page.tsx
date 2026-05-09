// /pricing-lms — landing pricing untuk plan upgrade LMS.
// Pattern mirror /pricing (LP) tapi untuk LmsUpgradePackage.
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { LmsPricingView } from '@/components/lms-subscription/LmsPricingView'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function LmsPricingPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  // Hanya plan aktif + priceMonthly > 0 (FREE skip karena lazy-create
  // saat user masuk LMS pertama kali).
  const packages = await prisma.lmsUpgradePackage.findMany({
    where: { isActive: true, priceMonthly: { gt: 0 } },
    orderBy: [{ sortOrder: 'asc' }, { priceMonthly: 'asc' }],
  })

  const [quota, balance, settings] = await Promise.all([
    prisma.lmsQuota.findUnique({
      where: { userId: session.user.id },
      select: { tier: true },
    }),
    prisma.tokenBalance.findUnique({
      where: { userId: session.user.id },
      select: { balance: true },
    }),
    prisma.pricingSettings.findFirst({ select: { pricePerToken: true } }),
  ])

  return (
    <LmsPricingView
      packages={packages.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        tier: p.tier,
        maxCourses: p.maxCourses,
        maxLessonsPerCourse: p.maxLessonsPerCourse,
        maxStudentsPerCourse: p.maxStudentsPerCourse,
        maxFileStorageMB: p.maxFileStorageMB,
        canUseDripSchedule: p.canUseDripSchedule,
        canIssueCertificate: p.canIssueCertificate,
        priceMonthly: p.priceMonthly,
        isPopular: p.isPopular,
      }))}
      currentTier={quota?.tier ?? 'FREE'}
      currentBalance={balance?.balance ?? 0}
      pricePerToken={settings?.pricePerToken ?? 2}
    />
  )
}
