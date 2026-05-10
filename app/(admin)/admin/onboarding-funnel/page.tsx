// /admin/onboarding-funnel — analytics funnel onboarding wizard.
//
// Tampilkan:
//   1. Wizard funnel: total user pilih goal vs skip vs no-action
//   2. Per-goal breakdown: berapa user pilih goal X, berapa selesai checklist
//   3. Drop-off per step: untuk tiap goal, step mana yg paling banyak di-skip
//
// Tujuan: admin bisa lihat di mana user awam stuck atau drop-off, lalu
// improve copy / urutan step.
import { Compass, TrendingDown, Users } from 'lucide-react'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { authOptions } from '@/lib/auth'
import { getChecklistDefinition } from '@/lib/onboarding/checklists'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const PERIOD_DAYS = 30 // window analytics — 30 hari terakhir
const GOALS = ['CS_AI', 'SELL_LP', 'SELL_WA', 'LMS'] as const

type Goal = (typeof GOALS)[number]

const GOAL_LABEL: Record<Goal, string> = {
  CS_AI: 'CS AI saja',
  SELL_LP: 'Jualan + LP',
  SELL_WA: 'Jualan WA only',
  LMS: 'Course / LMS',
}

export default async function AdminOnboardingFunnelPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.role !== 'ADMIN') redirect('/dashboard')

  const since = new Date(Date.now() - PERIOD_DAYS * 24 * 60 * 60 * 1000)

  // Hitung user yang signup di window — sebagai denominator wizard funnel.
  const totalSignups = await prisma.user.count({
    where: { createdAt: { gte: since } },
  })

  // Aggregate event-event utama.
  const [wizardAnswered, wizardSkipped, dismissed, allComplete, resets] =
    await Promise.all([
      prisma.onboardingEvent.groupBy({
        by: ['goal'],
        where: { step: 'wizard_answered', createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.onboardingEvent.count({
        where: { step: 'wizard_skip', createdAt: { gte: since } },
      }),
      prisma.onboardingEvent.groupBy({
        by: ['goal'],
        where: { step: 'checklist_dismissed', createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.onboardingEvent.groupBy({
        by: ['goal'],
        where: { step: 'checklist_all_complete', createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.onboardingEvent.count({
        where: { step: 'goal_reset', createdAt: { gte: since } },
      }),
    ])

  // Step-level events (skip/complete) per goal × stepId. meta.stepId = id step.
  const stepEvents = await prisma.onboardingEvent.findMany({
    where: {
      step: { in: ['step_skip', 'step_complete'] },
      createdAt: { gte: since },
    },
    select: { goal: true, step: true, meta: true },
  })

  // Aggregate ke struktur: { goal: { stepId: { skip, complete } } }
  type StepStat = { skip: number; complete: number }
  const stepAgg = new Map<string, Map<string, StepStat>>()
  for (const ev of stepEvents) {
    if (!ev.goal) continue
    const stepId = (ev.meta as { stepId?: unknown } | null)?.stepId
    if (typeof stepId !== 'string') continue
    let goalMap = stepAgg.get(ev.goal)
    if (!goalMap) {
      goalMap = new Map()
      stepAgg.set(ev.goal, goalMap)
    }
    let stat = goalMap.get(stepId)
    if (!stat) {
      stat = { skip: 0, complete: 0 }
      goalMap.set(stepId, stat)
    }
    if (ev.step === 'step_skip') stat.skip += 1
    else stat.complete += 1
  }

  // Snapshot user state — total user per goal saat ini (bukan hanya event,
  // tapi total goal aktif). Ini complement dengan event window.
  const usersByGoal = await prisma.user.groupBy({
    by: ['onboardingGoal'],
    where: { onboardingGoal: { not: null } },
    _count: { _all: true },
  })

  const totalAnswered = wizardAnswered.reduce((s, r) => s + r._count._all, 0)
  const noAction = Math.max(0, totalSignups - totalAnswered - wizardSkipped)

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-6 overflow-y-auto p-4 md:p-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
          Onboarding Funnel
        </h1>
        <p className="mt-1 text-sm text-warm-500">
          Analytics wizard intent + checklist progress, window {PERIOD_DAYS} hari
          terakhir. Sumber data: tabel <code className="font-mono">OnboardingEvent</code>.
        </p>
      </div>

      {/* Top-line metric */}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          icon={<Users className="size-5" />}
          label={`Signup ${PERIOD_DAYS}d`}
          value={totalSignups}
          hint="Total user baru"
        />
        <MetricCard
          icon={<Compass className="size-5" />}
          label="Pilih Goal"
          value={totalAnswered}
          hint={`${pct(totalAnswered, totalSignups)}% dari signup`}
        />
        <MetricCard
          icon={<TrendingDown className="size-5" />}
          label="Skip Wizard"
          value={wizardSkipped}
          hint={`${pct(wizardSkipped, totalSignups)}% dari signup`}
          tone="amber"
        />
      </div>

      {/* Goal breakdown */}
      <Card className="rounded-xl border-warm-200 shadow-sm">
        <CardHeader>
          <CardTitle className="font-display">Distribusi Goal</CardTitle>
          <CardDescription>
            Berapa banyak user yg pilih masing-masing goal — di window{' '}
            {PERIOD_DAYS} hari & total snapshot saat ini.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Goal</TableHead>
                <TableHead className="text-right">
                  Pilih ({PERIOD_DAYS}d)
                </TableHead>
                <TableHead className="text-right">
                  Tutup Checklist ({PERIOD_DAYS}d)
                </TableHead>
                <TableHead className="text-right">
                  Selesai Semua ({PERIOD_DAYS}d)
                </TableHead>
                <TableHead className="text-right">Total user (snapshot)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {GOALS.map((goal) => {
                const answered =
                  wizardAnswered.find((r) => r.goal === goal)?._count._all ?? 0
                const dis =
                  dismissed.find((r) => r.goal === goal)?._count._all ?? 0
                const done =
                  allComplete.find((r) => r.goal === goal)?._count._all ?? 0
                const total =
                  usersByGoal.find((r) => r.onboardingGoal === goal)?._count
                    ._all ?? 0
                return (
                  <TableRow key={goal}>
                    <TableCell className="font-medium">
                      {GOAL_LABEL[goal]}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {answered}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-amber-700">
                      {dis}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-700">
                      {done}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {total}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Per-step drop-off per goal */}
      {GOALS.map((goal) => {
        const def = getChecklistDefinition(goal)
        const goalStats = stepAgg.get(goal) ?? new Map<string, StepStat>()
        return (
          <Card key={goal} className="rounded-xl border-warm-200 shadow-sm">
            <CardHeader>
              <CardTitle className="font-display text-base">
                Drop-off — {GOAL_LABEL[goal]}
              </CardTitle>
              <CardDescription>
                Berapa kali tiap step di-skip vs di-mark-selesai manual oleh user.
                Step dengan rasio skip tinggi mungkin perlu di-rewording.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Step</TableHead>
                    <TableHead className="text-right">Skip</TableHead>
                    <TableHead className="text-right">Mark Selesai</TableHead>
                    <TableHead className="text-right">% Skip</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {def.steps.map((step, idx) => {
                    const stat = goalStats.get(step.id) ?? {
                      skip: 0,
                      complete: 0,
                    }
                    const total = stat.skip + stat.complete
                    const skipPct = total === 0 ? 0 : (stat.skip / total) * 100
                    return (
                      <TableRow key={step.id}>
                        <TableCell className="text-warm-500">{idx + 1}</TableCell>
                        <TableCell>
                          <p className="font-medium">{step.title}</p>
                          <p className="text-xs text-warm-500">
                            {step.id}
                            {step.optional ? ' · opsional' : ''}
                          </p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-amber-700">
                          {stat.skip}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-700">
                          {stat.complete}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums font-medium ${
                            skipPct > 50
                              ? 'text-rose-600'
                              : skipPct > 25
                                ? 'text-amber-700'
                                : 'text-warm-600'
                          }`}
                        >
                          {skipPct.toFixed(0)}%
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )
      })}

      <Card className="rounded-xl border-warm-200 bg-warm-50 shadow-sm">
        <CardContent className="flex flex-col gap-1 p-4 text-xs text-warm-600">
          <p>
            <strong>Catatan:</strong> auto-check (mis. WA connected, produk
            ditambahkan) <em>tidak</em> tercatat di tabel ini — hanya event manual.
            Auto-check menjadikan step completed di UI, tapi user tidak harus
            klik. Drop-off di sini = user yang sengaja klik "Lewati".
          </p>
          <p>
            Goal reset di window {PERIOD_DAYS}d:{' '}
            <span className="font-semibold tabular-nums">{resets}</span> ·
            User signup tanpa interaksi wizard:{' '}
            <span className="font-semibold tabular-nums">{noAction}</span>{' '}
            (~{pct(noAction, totalSignups)}%)
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function pct(num: number, denom: number): number {
  if (denom === 0) return 0
  return Math.round((num / denom) * 100)
}

function MetricCard({
  icon,
  label,
  value,
  hint,
  tone = 'primary',
}: {
  icon: React.ReactNode
  label: string
  value: number
  hint?: string
  tone?: 'primary' | 'amber'
}) {
  return (
    <Card className="rounded-xl border-warm-200 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-warm-500">
          {label}
        </CardTitle>
        <span
          className={`flex size-9 items-center justify-center rounded-lg ${
            tone === 'amber'
              ? 'bg-amber-100 text-amber-700'
              : 'bg-primary-100 text-primary-700'
          }`}
        >
          {icon}
        </span>
      </CardHeader>
      <CardContent>
        <div className="font-display text-3xl font-bold text-warm-900 tabular-nums">
          {value.toLocaleString('id-ID')}
        </div>
        {hint && <p className="mt-1 text-xs text-warm-500">{hint}</p>}
      </CardContent>
    </Card>
  )
}
