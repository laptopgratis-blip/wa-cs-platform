// Halaman /onboarding — Intent Wizard. Tampilkan form 2-step (Q1 goal pick,
// Q2 conditional kalau Q1=jualan fisik). Kalau user sudah punya goal atau
// sudah dismiss, redirect ke /dashboard.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { IntentWizard } from '@/components/onboarding/IntentWizard'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      onboardingGoal: true,
      onboardingDismissedAt: true,
    },
  })

  // Sudah pernah jawab atau skip permanent → tidak perlu lihat wizard lagi.
  if (user?.onboardingGoal || user?.onboardingDismissedAt) {
    redirect('/dashboard')
  }

  return <IntentWizard />
}
