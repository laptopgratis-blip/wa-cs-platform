// GET  /api/onboarding/checklist
//   Return resolved checklist (steps + status + progress) untuk user
//   berdasarkan goal-nya. Kalau user belum punya goal → return null
//   payload, frontend tinggal sembunyikan card.
//
// POST /api/onboarding/checklist
//   Body: { stepId: string, action: 'complete'|'skip'|'reset' }
//        | { action: 'dismiss' }                 // tutup checklist permanen
//        | { action: 'mark_all_complete' }      // pas user "selesai semua"
//   Update User.onboardingChecklist JSON + log event.
import { jsonError, jsonOk, requireSession } from '@/lib/api'
import {
  type OnboardingGoal,
  getChecklistDefinition,
} from '@/lib/onboarding/checklists'
import { parseManualState, resolveChecklist } from '@/lib/onboarding/state'
import { prisma } from '@/lib/prisma'

const VALID_GOALS = new Set<OnboardingGoal>([
  'CS_AI',
  'SELL_LP',
  'SELL_WA',
  'LMS',
])

export async function GET() {
  try {
    const session = await requireSession()
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        onboardingGoal: true,
        onboardingChecklist: true,
        onboardingDismissedAt: true,
        onboardingCompletedAt: true,
      },
    })

    if (!user) return jsonError('User tidak ditemukan', 404)

    // Hanya hide checklist data kalau user belum punya goal sama sekali.
    // dismissed/completed state di-include sebagai flag — frontend yang
    // decide cara render (compact link vs full progress card vs celebration).
    if (
      !user.onboardingGoal ||
      !VALID_GOALS.has(user.onboardingGoal as OnboardingGoal)
    ) {
      return jsonOk({ checklist: null })
    }

    const manual = parseManualState(user.onboardingChecklist)
    const resolved = await resolveChecklist(
      session.user.id,
      user.onboardingGoal as OnboardingGoal,
      manual,
    )

    return jsonOk({
      checklist: {
        goal: resolved.definition.goal,
        title: resolved.definition.title,
        subtitle: resolved.definition.subtitle,
        progressPct: resolved.progressPct,
        allRequiredDone: resolved.allRequiredDone,
        completedAt: user.onboardingCompletedAt,
        dismissed: user.onboardingDismissedAt !== null,
        steps: resolved.steps.map((s) => ({
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
        })),
      },
    })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[onboarding/checklist:GET]', e)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

interface PostBody {
  stepId?: unknown
  action?: unknown
}

export async function POST(req: Request) {
  try {
    const session = await requireSession()
    const body = (await req.json().catch(() => ({}))) as PostBody
    const action = String(body.action ?? '')

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { onboardingGoal: true, onboardingChecklist: true },
    })
    if (!user) return jsonError('User tidak ditemukan', 404)

    // Action tanpa stepId — global state.
    if (action === 'dismiss') {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: session.user.id },
          data: { onboardingDismissedAt: new Date() },
        }),
        prisma.onboardingEvent.create({
          data: {
            userId: session.user.id,
            goal: user.onboardingGoal,
            step: 'checklist_dismissed',
          },
        }),
      ])
      return jsonOk({ dismissed: true })
    }

    if (action === 'mark_all_complete') {
      if (!user.onboardingGoal) return jsonError('Belum ada goal', 400)
      const def = getChecklistDefinition(user.onboardingGoal as OnboardingGoal)
      const manual = parseManualState(user.onboardingChecklist)
      for (const s of def.steps) manual[s.id] = 'completed'
      await prisma.$transaction([
        prisma.user.update({
          where: { id: session.user.id },
          data: {
            onboardingChecklist: manual,
            onboardingCompletedAt: new Date(),
          },
        }),
        prisma.onboardingEvent.create({
          data: {
            userId: session.user.id,
            goal: user.onboardingGoal,
            step: 'checklist_all_complete',
          },
        }),
      ])
      return jsonOk({ completed: true })
    }

    // Action per-step.
    if (!user.onboardingGoal) return jsonError('Belum ada goal', 400)
    const stepId = typeof body.stepId === 'string' ? body.stepId : ''
    if (!stepId) return jsonError('stepId wajib', 400)

    const def = getChecklistDefinition(user.onboardingGoal as OnboardingGoal)
    if (!def.steps.some((s) => s.id === stepId)) {
      return jsonError('stepId tidak dikenal', 400)
    }

    const manual = parseManualState(user.onboardingChecklist)
    if (action === 'complete') manual[stepId] = 'completed'
    else if (action === 'skip') manual[stepId] = 'skipped'
    else if (action === 'reset') delete manual[stepId]
    else return jsonError('action tidak valid', 400)

    await prisma.$transaction([
      prisma.user.update({
        where: { id: session.user.id },
        data: { onboardingChecklist: manual },
      }),
      prisma.onboardingEvent.create({
        data: {
          userId: session.user.id,
          goal: user.onboardingGoal,
          step: `step_${action}`,
          meta: { stepId },
        },
      }),
    ])

    return jsonOk({ stepId, action })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[onboarding/checklist:POST]', e)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
