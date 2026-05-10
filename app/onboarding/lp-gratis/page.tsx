// /onboarding/lp-gratis — wizard standalone "Bikin LP Gratis dalam 5 menit".
// Independent dari onboarding goal — bisa diakses user mana pun, tidak set
// onboardingGoal otomatis. User awam tinggal ikutin 4 step linear.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { LpGratisWizard } from '@/components/onboarding/LpGratisWizard'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function LpGratisPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  return <LpGratisWizard />
}
