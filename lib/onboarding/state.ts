// State resolver untuk checklist user. Source of truth ada 3 lapis:
//
//   1. Manual user state (User.onboardingChecklist JSON) — user explicit
//      klik "Skip" atau "Tandai selesai". Stored: { stepId: 'completed'|'skipped' }.
//   2. Auto-check (DB count > 0) — kalau step punya autoCheck key.
//   3. Pending (default).
//
// Manual menang di atas auto-check kalau status='skipped'. Manual='completed'
// + auto-check=false → tetap completed (user tahu lebih baik).
import {
  type ChecklistDefinition,
  type ChecklistStep,
  type OnboardingGoal,
  getChecklistDefinition,
} from './checklists'
import { evaluateAutoChecks } from './auto-check'

export type StepStatus = 'pending' | 'completed' | 'skipped'

export interface ResolvedStep extends ChecklistStep {
  status: StepStatus
  autoChecked: boolean
}

export interface ResolvedChecklist {
  definition: ChecklistDefinition
  steps: ResolvedStep[]
  /** Persen step wajib (non-optional) yang completed. 0-100. */
  progressPct: number
  /** True kalau semua wajib completed. */
  allRequiredDone: boolean
}

type ManualState = Record<string, StepStatus>

export function parseManualState(raw: unknown): ManualState {
  if (!raw || typeof raw !== 'object') return {}
  const out: ManualState = {}
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (val === 'completed' || val === 'skipped' || val === 'pending') {
      out[key] = val
    }
  }
  return out
}

export async function resolveChecklist(
  userId: string,
  goal: OnboardingGoal,
  manualState: ManualState,
): Promise<ResolvedChecklist> {
  const definition = getChecklistDefinition(goal)

  const autoCheckKeys = definition.steps
    .map((s) => s.autoCheck)
    .filter((k): k is NonNullable<typeof k> => k !== null)

  const autoResults =
    autoCheckKeys.length > 0
      ? await evaluateAutoChecks(userId, autoCheckKeys)
      : ({} as Record<string, boolean>)

  const steps: ResolvedStep[] = definition.steps.map((step) => {
    const manual = manualState[step.id]
    const autoChecked = step.autoCheck
      ? Boolean(autoResults[step.autoCheck])
      : false

    let status: StepStatus
    if (manual === 'skipped') status = 'skipped'
    else if (manual === 'completed') status = 'completed'
    else if (autoChecked) status = 'completed'
    else status = 'pending'

    return { ...step, status, autoChecked }
  })

  const required = steps.filter((s) => !s.optional)
  const requiredDone = required.filter(
    (s) => s.status === 'completed' || s.status === 'skipped',
  ).length
  const progressPct =
    required.length === 0 ? 100 : Math.round((requiredDone / required.length) * 100)
  const allRequiredDone = requiredDone === required.length

  return { definition, steps, progressPct, allRequiredDone }
}
