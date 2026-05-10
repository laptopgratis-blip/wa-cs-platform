// /onboarding/guide — wizard mode satu-langkah-per-layar.
//
// Server component fetch state checklist + render OnboardingGuide client.
// Auto-pick step pertama yang masih pending sebagai active step. User bisa
// navigasi prev/next dengan query param ?step=N (1-indexed).
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { OnboardingGuide } from '@/components/onboarding/OnboardingGuide'
import { authOptions } from '@/lib/auth'
import {
  type OnboardingGoal,
  getChecklistDefinition,
} from '@/lib/onboarding/checklists'
import { parseManualState, resolveChecklist } from '@/lib/onboarding/state'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ step?: string }>
}

export default async function OnboardingGuidePage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      onboardingGoal: true,
      onboardingChecklist: true,
    },
  })

  if (!user?.onboardingGoal) {
    // Belum pilih goal → ke wizard intent dulu.
    redirect('/onboarding')
  }

  const goal = user.onboardingGoal as OnboardingGoal
  const def = getChecklistDefinition(goal)
  const manual = parseManualState(user.onboardingChecklist)
  const resolved = await resolveChecklist(session.user.id, goal, manual)

  // Pick active step: dari query param, atau auto-pick step pertama yang
  // masih pending (kalau semua selesai → step terakhir + show celebration).
  const params = await searchParams
  const requestedStep = params.step ? parseInt(params.step, 10) : NaN
  let activeIndex: number
  if (
    !isNaN(requestedStep) &&
    requestedStep >= 1 &&
    requestedStep <= def.steps.length
  ) {
    activeIndex = requestedStep - 1
  } else {
    // Auto-pick: cari index pertama yang status='pending'. Kalau tidak ada,
    // fallback ke index terakhir (user akan lihat celebration screen).
    const firstPending = resolved.steps.findIndex((s) => s.status === 'pending')
    activeIndex = firstPending === -1 ? def.steps.length - 1 : firstPending
  }

  return (
    <OnboardingGuide
      goal={goal}
      title={def.title}
      subtitle={def.subtitle}
      activeIndex={activeIndex}
      progressPct={resolved.progressPct}
      allRequiredDone={resolved.allRequiredDone}
      steps={resolved.steps.map((s, i) => ({
        index: i,
        id: s.id,
        title: s.title,
        description: s.description,
        href: s.href,
        estimatedMin: s.estimatedMin,
        status: s.status,
        autoChecked: s.autoChecked,
        hasAutoCheck: s.autoCheck !== null,
        optional: s.optional ?? false,
        requiresPlan: s.requiresPlan ?? null,
        instructions: s.instructions ?? [],
        actionLabel: s.actionLabel ?? `Buka halaman`,
        inlineTask: s.inlineTask ?? null,
      }))}
    />
  )
}
