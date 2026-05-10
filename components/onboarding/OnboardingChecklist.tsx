'use client'

// OnboardingChecklist — card prominent di top /dashboard. Tampil hanya
// untuk user yang sudah punya goal & belum dismiss. Self-fetching state
// supaya re-eval auto-check tiap mount + bisa refresh after action.
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Crown,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface ChecklistStep {
  id: string
  title: string
  description: string
  href: string
  estimatedMin: number
  status: 'pending' | 'completed' | 'skipped'
  autoChecked: boolean
  hasAutoCheck: boolean
  optional: boolean
  requiresPlan: 'POWER' | 'LMS' | null
}

interface ChecklistData {
  goal: string
  title: string
  subtitle: string
  progressPct: number
  allRequiredDone: boolean
  completedAt: string | null
  steps: ChecklistStep[]
}

export function OnboardingChecklist() {
  const router = useRouter()
  const [data, setData] = useState<ChecklistData | null>(null)
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)

  async function handleResetGoal() {
    if (
      !confirm(
        'Yakin mau ganti tujuan? Setelah ini kamu akan diarahkan ke wizard untuk pilih ulang.',
      )
    )
      return
    setBusy('reset')
    try {
      const res = await fetch('/api/onboarding/reset-goal', { method: 'POST' })
      if (!res.ok) throw new Error('Gagal reset')
      router.push('/onboarding')
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal'
      toast.error(msg)
      setBusy(null)
    }
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/onboarding/checklist', { cache: 'no-store' })
      if (!res.ok) throw new Error('Gagal memuat')
      const json = await res.json()
      setData(json.checklist)
    } catch (err) {
      console.error('[OnboardingChecklist:load]', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const postAction = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(JSON.stringify(body))
      try {
        const res = await fetch('/api/onboarding/checklist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error(json.error ?? 'Gagal')
        }
        await load()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gagal'
        toast.error(msg)
      } finally {
        setBusy(null)
      }
    },
    [load],
  )

  useEffect(() => {
    void load()
  }, [load])

  if (loading || hidden) return null
  if (!data) return null

  const completedCount = data.steps.filter(
    (s) => s.status === 'completed' || s.status === 'skipped',
  ).length
  const totalCount = data.steps.length

  return (
    <Card className="overflow-hidden rounded-2xl border-2 border-primary-200 bg-gradient-to-br from-primary-50 via-orange-50 to-amber-50 shadow-md">
      <div className="flex items-start justify-between gap-3 border-b border-primary-100/60 bg-white/40 p-5">
        <div className="flex flex-1 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-500 text-white shadow-orange">
            <Sparkles className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-extrabold text-warm-900">
                {data.title}
              </h2>
              <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-semibold text-primary-700">
                {completedCount}/{totalCount}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-warm-600">{data.subtitle}</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-warm-200/60">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary-500 to-orange-500 transition-all"
                  style={{ width: `${data.progressPct}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-warm-700 tabular-nums">
                {data.progressPct}%
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="hidden h-8 gap-1.5 px-2 text-xs text-warm-600 hover:text-warm-900 sm:inline-flex"
            disabled={busy !== null}
            onClick={handleResetGoal}
            title="Ubah tujuan onboarding"
          >
            <RotateCcw className="size-3.5" />
            <span>Ubah tujuan</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="size-8 p-0"
            aria-label={collapsed ? 'Buka' : 'Tutup'}
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronUp className="size-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="size-8 p-0 text-warm-500 hover:text-rose-600"
            aria-label="Tutup permanen"
            disabled={busy !== null}
            onClick={async () => {
              if (
                !confirm(
                  'Tutup checklist ini permanen? Kamu masih bisa atur ulang dari Pengaturan.',
                )
              )
                return
              setHidden(true)
              await postAction({ action: 'dismiss' })
            }}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {!collapsed && (
        <div className="flex flex-col divide-y divide-primary-100/60">
          {data.allRequiredDone && (
            <div className="flex items-center gap-3 bg-emerald-50 p-4 text-sm text-emerald-800">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                <Check className="size-4" />
              </span>
              <p className="flex-1 font-medium">
                Mantap! Semua langkah utama sudah selesai. Selamat berjualan! 🎉
              </p>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy !== null}
                onClick={() => {
                  setHidden(true)
                  void postAction({ action: 'dismiss' })
                }}
              >
                Tutup
              </Button>
            </div>
          )}

          {data.steps.map((step, idx) => (
            <StepRow
              key={step.id}
              step={step}
              index={idx + 1}
              busy={busy !== null}
              onSkip={() =>
                postAction({ action: 'skip', stepId: step.id })
              }
              onComplete={() =>
                postAction({ action: 'complete', stepId: step.id })
              }
              onReset={() =>
                postAction({ action: 'reset', stepId: step.id })
              }
            />
          ))}
        </div>
      )}
    </Card>
  )
}

interface StepRowProps {
  step: ChecklistStep
  index: number
  busy: boolean
  onSkip: () => void
  onComplete: () => void
  onReset: () => void
}

function StepRow({ step, index, busy, onSkip, onComplete, onReset }: StepRowProps) {
  const done = step.status === 'completed'
  const skipped = step.status === 'skipped'

  return (
    <div
      className={cn(
        'flex flex-col gap-3 p-4 transition-colors sm:flex-row sm:items-center sm:gap-4',
        done && 'bg-emerald-50/60',
        skipped && 'bg-warm-100/60',
      )}
    >
      <div
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold',
          done
            ? 'bg-emerald-500 text-white'
            : skipped
              ? 'bg-warm-300 text-warm-600'
              : 'bg-white text-warm-700 ring-2 ring-primary-200',
        )}
      >
        {done ? <Check className="size-4" /> : skipped ? '–' : index}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={cn(
              'font-semibold text-warm-900',
              (done || skipped) && 'text-warm-500 line-through decoration-warm-400',
            )}
          >
            {step.title}
          </p>
          {step.optional && (
            <span className="rounded-full bg-warm-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warm-600">
              Opsional
            </span>
          )}
          {step.requiresPlan && !done && !skipped && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
              <Crown className="size-3" /> Butuh {step.requiresPlan}
            </span>
          )}
          {step.autoChecked && done && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              Auto-terdeteksi
            </span>
          )}
          <span className="text-xs text-warm-500">~{step.estimatedMin}m</span>
        </div>
        <p
          className={cn(
            'mt-0.5 text-sm',
            done || skipped ? 'text-warm-500' : 'text-warm-600',
          )}
        >
          {step.description}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {done || skipped ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={onReset}
            className="text-xs text-warm-500"
          >
            Buka lagi
          </Button>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={onSkip}
              className="text-xs text-warm-500"
            >
              Lewati
            </Button>
            {/* Step manual (no autoCheck) butuh tombol "Tandai selesai"
                terpisah karena DB-count tidak bisa detect (mis. "test chat
                dengan diri sendiri"). */}
            {!step.hasAutoCheck && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={onComplete}
                className="text-xs"
              >
                Tandai selesai
              </Button>
            )}
            <Button variant="default" size="sm" asChild>
              <Link href={step.href}>
                Buka <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
