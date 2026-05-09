// /upgrade-lms?plan=<lmsPackageId>&duration=<months>
// Single-step token checkout untuk plan LMS. Mirror /upgrade (LP).
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { LmsUpgradeView } from '@/components/lms-subscription/LmsUpgradeView'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

interface SearchParams {
  searchParams: Promise<{ plan?: string; duration?: string }>
}

export default async function UpgradeLmsPage({ searchParams }: SearchParams) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { plan, duration } = await searchParams
  if (!plan) redirect('/pricing-lms')

  const pkg = await prisma.lmsUpgradePackage.findUnique({
    where: { id: plan },
  })
  if (!pkg || !pkg.isActive || pkg.priceMonthly <= 0) {
    redirect('/pricing-lms')
  }

  const validDurations = [1, 3, 6, 12]
  const initialDuration = Number(duration) || 1
  const finalDuration = validDurations.includes(initialDuration)
    ? initialDuration
    : 1

  return (
    <LmsUpgradeView
      pkg={{
        id: pkg.id,
        name: pkg.name,
        tier: pkg.tier,
        description: pkg.description,
        maxCourses: pkg.maxCourses,
        maxLessonsPerCourse: pkg.maxLessonsPerCourse,
        maxStudentsPerCourse: pkg.maxStudentsPerCourse,
        priceMonthly: pkg.priceMonthly,
      }}
      initialDuration={finalDuration}
    />
  )
}
