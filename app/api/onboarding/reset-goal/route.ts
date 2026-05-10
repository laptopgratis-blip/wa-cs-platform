// POST /api/onboarding/reset-goal
//
// Reset onboarding state user — kosongkan goal, completedAt, dismissedAt.
// Checklist progress (User.onboardingChecklist) DIBIARKAN — kalau goal
// dipilih ulang sama, progress lama bisa kebawa. Kalau goal beda, step yang
// tidak relevan dengan goal baru akan diabaikan saat resolve.
//
// Setelah call ini, frontend redirect ke /onboarding untuk pilih goal lagi.
import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export async function POST() {
  try {
    const session = await requireSession()

    await prisma.$transaction([
      prisma.user.update({
        where: { id: session.user.id },
        data: {
          onboardingGoal: null,
          onboardingCompletedAt: null,
          onboardingDismissedAt: null,
        },
      }),
      prisma.onboardingEvent.create({
        data: {
          userId: session.user.id,
          step: 'goal_reset',
        },
      }),
    ])

    return jsonOk({ reset: true })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[onboarding/reset-goal]', e)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
