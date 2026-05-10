// EmbeddedOnboardingGuide — server component yang load checklist state
// (mirror /onboarding/guide page) lalu render OnboardingGuide dalam mode
// embedded. Dipakai di dashboard supaya wizard step-by-step muncul inline,
// tidak perlu navigate ke /onboarding/guide.
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import {
  type OnboardingGoal,
  getChecklistDefinition,
} from '@/lib/onboarding/checklists'
import { parseManualState, resolveChecklist } from '@/lib/onboarding/state'
import { prisma } from '@/lib/prisma'

import { OnboardingGuide } from './OnboardingGuide'

interface Props {
  /**
   * Step yang harus aktif (1-indexed) dari URL searchParams. Kalau tidak
   * dikasih, auto-pick step pertama yang masih pending.
   */
  step?: string
  /**
   * Path tempat wizard di-embed (default '/dashboard'). Dipakai untuk URL
   * navigation saat user klik Next/Prev/Step pill — supaya tetap di halaman
   * yang sama.
   */
  basePath?: string
}

export async function EmbeddedOnboardingGuide({
  step,
  basePath = '/dashboard',
}: Props) {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      onboardingGoal: true,
      onboardingChecklist: true,
      onboardingDismissedAt: true,
    },
  })

  // Tidak punya goal aktif → jangan render apa-apa (dashboard akan kasih
  // OnboardingGoalSelector untuk pilih goal).
  if (!user?.onboardingGoal) return null
  // User dismiss permanen → respect.
  if (user.onboardingDismissedAt) return null

  const goal = user.onboardingGoal as OnboardingGoal
  const def = getChecklistDefinition(goal)
  const manual = parseManualState(user.onboardingChecklist)
  const resolved = await resolveChecklist(session.user.id, goal, manual)

  // Pick active step dari URL atau auto-pick pertama yang pending.
  const requestedStep = step ? parseInt(step, 10) : NaN
  let activeIndex: number
  if (
    !Number.isNaN(requestedStep) &&
    requestedStep >= 1 &&
    requestedStep <= def.steps.length
  ) {
    activeIndex = requestedStep - 1
  } else {
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
      basePath={basePath}
      embedded
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
