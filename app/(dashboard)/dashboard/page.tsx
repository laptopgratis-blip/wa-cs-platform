// Halaman utama dashboard — ringkasan stats user.
import { CreditCard, MessageCircle, MessageSquare, Users } from 'lucide-react'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { BalanceBanner } from '@/components/dashboard/BalanceBanner'
import { MessagesChart, type ChartPoint } from '@/components/dashboard/MessagesChart'
import { OnboardingGoalSelector } from '@/components/onboarding/OnboardingGoalSelector'
import {
  type OnboardingProgressData,
  OnboardingProgressCard,
} from '@/components/onboarding/OnboardingProgressCard'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { authOptions } from '@/lib/auth'
import { formatNumber } from '@/lib/format'
import {
  type OnboardingGoal,
  getChecklistDefinition,
} from '@/lib/onboarding/checklists'
import { parseManualState, resolveChecklist } from '@/lib/onboarding/state'
import { prisma } from '@/lib/prisma'
import { cn } from '@/lib/utils'

const VALID_GOALS = new Set<OnboardingGoal>(['CS_AI', 'SELL_LP', 'SELL_WA', 'LMS'])

async function loadOnboardingProgress(
  userId: string,
): Promise<OnboardingProgressData | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingGoal: true, onboardingChecklist: true },
  })
  if (!user?.onboardingGoal) return null
  if (!VALID_GOALS.has(user.onboardingGoal as OnboardingGoal)) return null

  const goal = user.onboardingGoal as OnboardingGoal
  const def = getChecklistDefinition(goal)
  const manual = parseManualState(user.onboardingChecklist)
  const resolved = await resolveChecklist(userId, goal, manual)

  const completed = resolved.steps.filter(
    (s) => s.status === 'completed' || s.status === 'skipped',
  ).length
  return {
    title: def.title,
    progressPct: resolved.progressPct,
    allRequiredDone: resolved.allRequiredDone,
    totalSteps: resolved.steps.length,
    completedSteps: completed,
    remainingSteps: Math.max(0, resolved.steps.length - completed),
  }
}

const DAYS = 7
const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

// Jangan cache — dashboard harus selalu real-time.
export const dynamic = 'force-dynamic'

async function loadStats(userId: string) {
  // Range 7 hari terakhir (termasuk hari ini), mulai jam 00:00 lokal.
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (DAYS - 1))

  const [tokenBalance, waCount, contactCount, messages] = await Promise.all([
    prisma.tokenBalance.findUnique({ where: { userId } }),
    prisma.whatsappSession.count({ where: { userId, status: 'CONNECTED' } }),
    prisma.contact.count({ where: { userId } }),
    prisma.message.findMany({
      where: {
        waSession: { userId },
        createdAt: { gte: start },
        role: { in: ['USER', 'AI'] },
      },
      select: { createdAt: true, role: true },
    }),
  ])

  // Bucket per hari (key = "YYYY-MM-DD" lokal).
  const buckets = new Map<string, { USER: number; AI: number }>()
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    buckets.set(toKey(d), { USER: 0, AI: 0 })
  }
  for (const m of messages) {
    const key = toKey(m.createdAt)
    const bucket = buckets.get(key)
    if (!bucket) continue
    if (m.role === 'USER') bucket.USER += 1
    else if (m.role === 'AI') bucket.AI += 1
  }

  const chart: ChartPoint[] = []
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const bucket = buckets.get(toKey(d))!
    chart.push({
      label: `${DAY_LABELS[d.getDay()]} ${d.getDate()}`,
      USER: bucket.USER,
      AI: bucket.AI,
    })
  }

  return {
    balance: tokenBalance?.balance ?? 0,
    waCount,
    contactCount,
    messages7d: messages.length,
    chart,
  }
}

function toKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function firstName(full: string | null | undefined): string {
  if (!full) return 'kawan'
  return full.trim().split(/\s+/)[0] ?? 'kawan'
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const [stats, userMeta, progressData] = await Promise.all([
    loadStats(session.user.id),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { onboardingGoal: true },
    }),
    loadOnboardingProgress(session.user.id),
  ])
  const onboardingGoal = userMeta?.onboardingGoal as
    | OnboardingGoal
    | null
    | undefined

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-7 overflow-y-auto p-4 md:p-6">
      <div className="opacity-0 animate-fade-slide-up">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
          Selamat datang, {firstName(session.user.name)} 👋
        </h1>
        <p className="mt-1 text-sm text-warm-500">
          Berikut ringkasan akunmu hari ini — saldo, koneksi WA, dan aktivitas pesan.
        </p>
      </div>

      <BalanceBanner balance={stats.balance} />

      {/* Onboarding progress — server-rendered prominent card "Lanjutkan goal
          kamu" dengan tombol besar ke /onboarding/guide. Pre-loaded data biar
          tidak ada flicker / loading state saat hydrate. */}
      <OnboardingProgressCard initialData={progressData} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<CreditCard className="size-5" />}
          label="Saldo Token"
          value={formatNumber(stats.balance)}
          hint="Tersisa untuk balas pesan"
          stagger="stagger-1"
        />
        <StatCard
          icon={<MessageCircle className="size-5" />}
          label="WhatsApp Tersambung"
          value={formatNumber(stats.waCount)}
          hint="Akun yang aktif"
          stagger="stagger-2"
        />
        <StatCard
          icon={<Users className="size-5" />}
          label="Total Kontak"
          value={formatNumber(stats.contactCount)}
          hint="Customer di CRM"
          stagger="stagger-3"
        />
        <StatCard
          icon={<MessageSquare className="size-5" />}
          label="Pesan 7 Hari"
          value={formatNumber(stats.messages7d)}
          hint="Customer + AI"
          stagger="stagger-4"
        />
      </div>

      <Card className="opacity-0 animate-fade-slide-up rounded-xl border-warm-200 shadow-sm" style={{ animationDelay: '250ms' }}>
        <CardHeader>
          <CardTitle className="font-display">Aktivitas Pesan 7 Hari Terakhir</CardTitle>
          <CardDescription>
            Jumlah pesan masuk dari customer dan balasan AI per hari.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MessagesChart data={stats.chart} />
        </CardContent>
      </Card>

      {/* Semua wizard ditawarkan ulang — user bisa switch goal kapan saja
          tanpa harus reset manual. Checklist & menu di atas auto-update. */}
      <OnboardingGoalSelector currentGoal={onboardingGoal ?? null} />
    </div>
  )
}

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  stagger?: string
}

function StatCard({ icon, label, value, hint, stagger }: StatCardProps) {
  return (
    <Card
      className={cn(
        'group rounded-xl border-warm-200 shadow-sm hover-lift opacity-0 animate-fade-slide-up',
        stagger,
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-warm-500">
          {label}
        </CardTitle>
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary-100 text-primary-500 transition-colors group-hover:bg-primary-500 group-hover:text-white">
          {icon}
        </span>
      </CardHeader>
      <CardContent>
        <div className="font-display text-3xl font-bold text-warm-900 dark:text-warm-50 tabular-nums">
          {value}
        </div>
        {hint && <p className="mt-1 text-xs text-warm-500">{hint}</p>}
      </CardContent>
    </Card>
  )
}
