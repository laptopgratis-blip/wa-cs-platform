// POST /api/onboarding/save-goal
//
// Body: { goal: 'CS_AI'|'SELL_LP'|'SELL_WA'|'LMS'|null, isSkip?: boolean }
//
// Simpan goal user + log event audit. isSkip=true menandakan user explicit
// klik "Lewati" (set onboardingDismissedAt) supaya tidak ada redirect ulang.
// goal=null tanpa isSkip = TBD state (tidak boleh).
import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

const VALID_GOALS = new Set(['CS_AI', 'SELL_LP', 'SELL_WA', 'LMS'])

export async function POST(req: Request) {
  try {
    const session = await requireSession()
    const body = (await req.json().catch(() => ({}))) as {
      goal?: unknown
      isSkip?: unknown
    }

    const isSkip = body.isSkip === true
    const goal =
      typeof body.goal === 'string' && VALID_GOALS.has(body.goal)
        ? body.goal
        : null

    // Validasi: kalau bukan skip, goal wajib valid string.
    if (!isSkip && !goal) {
      return jsonError('Goal tidak valid', 400)
    }

    const now = new Date()

    await prisma.$transaction([
      prisma.user.update({
        where: { id: session.user.id },
        data: {
          onboardingGoal: goal,
          // isSkip → set dismissedAt supaya tidak di-redirect lagi.
          // Goal valid → biarkan dismissedAt null (checklist tetap show
          // sampai user klik "tutup checklist permanen" di dashboard).
          onboardingDismissedAt: isSkip ? now : null,
        },
      }),
      prisma.onboardingEvent.create({
        data: {
          userId: session.user.id,
          goal,
          step: isSkip ? 'wizard_skip' : 'wizard_answered',
          meta: { goal, isSkip },
        },
      }),
    ])

    return jsonOk({ goal, isSkip })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[onboarding/save-goal]', e)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
