'use client'

// OnboardingGuide — wizard mode satu-langkah-per-layar.
// Beda dari OnboardingChecklist (list view di dashboard): di sini fokus 1
// step at a time, dengan instruksi detail + tombol action besar + navigasi
// Sebelumnya/Lewati/Selanjutnya. Auto-refresh saat tab regain focus
// (user kembali setelah buka halaman fitur di tab baru).
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Crown,
  ExternalLink,
  PartyPopper,
  RefreshCw,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { InlineTaskHost } from '@/components/onboarding/inline/InlineTaskHost'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { InlineTaskKind } from '@/lib/onboarding/checklists'
import { cn } from '@/lib/utils'

type Goal = 'CS_AI' | 'SELL_LP' | 'SELL_WA' | 'LMS'

interface GuideStep {
  index: number
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
  instructions: string[]
  actionLabel: string
  inlineTask: InlineTaskKind | null
}

interface Props {
  goal: Goal
  title: string
  subtitle: string
  activeIndex: number
  progressPct: number
  allRequiredDone: boolean
  steps: GuideStep[]
  /**
   * Base path untuk URL navigation ?step=N. Default '/onboarding/guide'.
   * Saat di-embed di dashboard, set ke '/dashboard' supaya next/prev tetap
   * di halaman dashboard (tidak pindah halaman).
   */
  basePath?: string
  /**
   * Embedded mode = wizard di-render di dalam halaman lain (dashboard).
   * Ubah beberapa UI:
   *  - Celebration screen lebih kompak (tidak full-page)
   *  - Tombol "Buka Dashboard" tidak ditampilkan (sudah di sini)
   *  - "Tutup panduan permanen" tetap ada untuk dismiss card
   */
  embedded?: boolean
}

export function OnboardingGuide({
  title,
  subtitle,
  activeIndex,
  progressPct,
  allRequiredDone,
  steps,
  basePath = '/onboarding/guide',
  embedded = false,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [busy, setBusy] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const active = steps[activeIndex]
  const isLastStep = activeIndex === steps.length - 1
  const isFirstStep = activeIndex === 0

  // Auto-refresh saat tab regain focus — user mungkin baru selesai action di
  // tab lain, perlu re-eval auto-check.
  useEffect(() => {
    function onFocus() {
      router.refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [router])

  const goToStep = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= steps.length) return
      const params = new URLSearchParams(searchParams.toString())
      params.set('step', String(idx + 1))
      router.push(`${basePath}?${params.toString()}`)
    },
    [router, searchParams, steps.length, basePath],
  )

  async function postAction(stepId: string, action: 'complete' | 'skip') {
    setBusy(action)
    try {
      const res = await fetch('/api/onboarding/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepId, action }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Gagal')
      }
      // Lanjut ke step berikutnya kalau ada, atau refresh kalau di last.
      if (!isLastStep) {
        goToStep(activeIndex + 1)
      } else {
        router.refresh()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal'
      toast.error(msg)
    } finally {
      setBusy(null)
    }
  }

  async function dismissChecklist() {
    if (
      !confirm(
        'Tutup panduan ini? Kamu masih bisa akses ulang dari Dashboard atau Pengaturan.',
      )
    )
      return
    setBusy('dismiss')
    try {
      await fetch('/api/onboarding/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss' }),
      })
      router.push('/dashboard')
    } catch {
      toast.error('Gagal')
      setBusy(null)
    }
  }

  function refresh() {
    setRefreshing(true)
    router.refresh()
    setTimeout(() => setRefreshing(false), 1000)
  }

  // ─── Celebration screen kalau semua wajib selesai ────────────────────
  if (allRequiredDone) {
    if (embedded) {
      return (
        <Card className="overflow-hidden rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 shadow-sm">
          <div className="flex items-center gap-4 p-5">
            <div className="shadow-orange flex size-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white">
              <PartyPopper className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-warm-900 text-base font-extrabold">
                Setup selesai
              </h2>
              <p className="text-warm-600 text-sm">
                Semua langkah utama untuk <strong>{title}</strong> sudah
                selesai.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => goToStep(0)}>
              Lihat ulang
            </Button>
          </div>
        </Card>
      )
    }
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="shadow-orange mb-6 flex size-24 items-center justify-center rounded-full bg-emerald-500 text-white">
          <PartyPopper className="size-12" />
        </div>
        <h1 className="font-display text-warm-900 text-3xl font-extrabold tracking-tight md:text-4xl">
          Mantap! Setup selesai
        </h1>
        <p className="text-warm-600 mx-auto mt-3 max-w-md">
          Semua langkah penting untuk <strong>{title}</strong> sudah kamu
          selesaikan. Saatnya buka dashboard dan mulai jalanin bisnis.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button
            asChild
            size="lg"
            className="bg-primary-500 hover:bg-primary-600"
          >
            <Link href="/dashboard">
              Buka Dashboard <ArrowRight className="ml-1.5 size-4" />
            </Link>
          </Button>
          <Button variant="outline" size="lg" onClick={() => goToStep(0)}>
            Lihat ulang langkah-langkah
          </Button>
        </div>
      </div>
    )
  }

  if (!active) return null

  const stepNum = active.index + 1
  const totalSteps = steps.length

  // Status badge per step
  const isDone = active.status === 'completed'
  const isSkipped = active.status === 'skipped'

  return (
    <div className="flex flex-col gap-6">
      {/* Header — title + progress */}
      <div>
        <p className="text-primary-600 text-xs font-semibold tracking-wider uppercase">
          {title}
        </p>
        <p className="text-warm-600 mt-1 text-sm">{subtitle}</p>
        <div className="mt-4 flex items-center gap-3">
          <span className="text-warm-600 text-xs font-semibold">
            Langkah {stepNum} dari {totalSteps}
          </span>
          <div className="bg-warm-200/60 h-2 flex-1 overflow-hidden rounded-full">
            <div
              className="from-primary-500 h-full rounded-full bg-gradient-to-r to-orange-500 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-warm-700 text-xs font-semibold tabular-nums">
            {progressPct}%
          </span>
        </div>
      </div>

      {/* Step pills (compact navigation) */}
      <div className="flex flex-wrap gap-1.5">
        {steps.map((s) => {
          const sDone = s.status === 'completed'
          const sSkipped = s.status === 'skipped'
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => goToStep(s.index)}
              className={cn(
                'flex size-7 items-center justify-center rounded-full text-xs font-bold transition-colors',
                s.index === activeIndex
                  ? 'bg-primary-500 ring-primary-200 text-white ring-2'
                  : sDone
                    ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                    : sSkipped
                      ? 'bg-warm-300 text-warm-600 hover:bg-warm-400'
                      : 'bg-warm-100 text-warm-600 hover:bg-warm-200',
              )}
              title={s.title}
            >
              {sDone ? <Check className="size-3.5" /> : s.index + 1}
            </button>
          )
        })}
      </div>

      {/* Active step card */}
      <Card className="border-primary-200 overflow-hidden rounded-2xl border-2 shadow-lg">
        <CardContent className="p-0">
          <div className="border-primary-100 from-primary-50 border-b bg-gradient-to-br to-orange-50 p-6">
            <div className="flex items-start gap-4">
              <div className="bg-primary-500 shadow-orange flex size-12 shrink-0 items-center justify-center rounded-xl text-xl font-bold text-white">
                {stepNum}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-warm-900 text-xl leading-tight font-extrabold">
                    {active.title}
                  </h2>
                  {active.optional && (
                    <span className="bg-warm-200 text-warm-600 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                      Opsional
                    </span>
                  )}
                  {active.requiresPlan && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                      <Crown className="size-3" /> Butuh {active.requiresPlan}
                    </span>
                  )}
                  <span className="text-warm-500 text-xs">
                    ~{active.estimatedMin} menit
                  </span>
                </div>
                <p className="text-warm-700 mt-1.5 text-sm">
                  {active.description}
                </p>

                {/* Status badge */}
                {(isDone || isSkipped) && (
                  <div
                    className={cn(
                      'mt-3 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold',
                      isDone
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-warm-200 text-warm-600',
                    )}
                  >
                    {isDone ? (
                      <>
                        <Check className="size-3.5" />
                        {active.autoChecked
                          ? 'Sudah terdeteksi otomatis'
                          : 'Sudah ditandai selesai'}
                      </>
                    ) : (
                      <>– Dilewati</>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-5 p-6">
            {/* Instruksi step-by-step */}
            {active.instructions.length > 0 && (
              <div>
                <p className="text-warm-700 mb-3 text-sm font-semibold">
                  Cara melakukan:
                </p>
                <ol className="text-warm-700 space-y-2.5 text-sm">
                  {active.instructions.map((line, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="bg-warm-100 text-warm-700 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                        {i + 1}
                      </span>
                      <span className="pt-0.5">{line}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Action inline — selalu render kalau step punya inlineTask,
                terlepas dari status completed/skipped. Component sendiri
                yang handle "sudah pernah dilakukan" view (mis. QR jadi
                "WhatsApp tersambung", form jadi tetap kosong untuk tambah
                lain). User bisa lihat detail tiap step kapan saja. */}
            {active.inlineTask && (
              <InlineTaskHost
                kind={active.inlineTask}
                fallbackHref={active.href}
                onCompleted={() => {
                  // Mark step completed + auto-advance ke step berikut.
                  void postAction(active.id, 'complete')
                }}
              />
            )}
            {/* Fallback: kalau ada step legacy tanpa inlineTask, tampilkan
                instruksi saja + tombol Refresh status. */}
            {!active.inlineTask && !isDone && !isSkipped && (
              <Button
                variant="outline"
                size="lg"
                onClick={refresh}
                disabled={refreshing}
                title="Cek apakah step sudah selesai"
              >
                <RefreshCw
                  className={cn('mr-2 size-4', refreshing && 'animate-spin')}
                />
                Refresh status
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Navigation buttons — selalu kasih jalan keluar:
          - Sebelumnya: kalau bukan first step
          - Lewati: kalau pending (skip + auto-advance)
          - Tandai selesai: kalau pending (always — biar user bisa force complete
            kalau auto-detect lambat / step manual yg memang butuh manual mark)
          - Selanjutnya: SELALU tampil kalau bukan last step (navigate saja
            tanpa mark — auto-check akan handle next visit)
          - Buka Dashboard: kalau last step
       */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() => goToStep(activeIndex - 1)}
          disabled={isFirstStep || busy !== null}
        >
          <ArrowLeft className="mr-1.5 size-4" /> Sebelumnya
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          {!isDone && !isSkipped && (
            <>
              <Button
                variant="ghost"
                onClick={() => postAction(active.id, 'skip')}
                disabled={busy !== null}
                className="text-warm-600"
              >
                {busy === 'skip' ? 'Memproses…' : 'Lewati'}
              </Button>
              <Button
                variant="outline"
                onClick={() => postAction(active.id, 'complete')}
                disabled={busy !== null}
              >
                <Check className="mr-1.5 size-4" />
                {busy === 'complete' ? 'Memproses…' : 'Tandai selesai'}
              </Button>
            </>
          )}
          {!isLastStep && (
            <Button
              onClick={() => goToStep(activeIndex + 1)}
              disabled={busy !== null}
            >
              Selanjutnya <ArrowRight className="ml-1.5 size-4" />
            </Button>
          )}
          {isLastStep && !embedded && (
            <Button asChild>
              <Link href="/dashboard">
                Selesai, buka Dashboard <ArrowRight className="ml-1.5 size-4" />
              </Link>
            </Button>
          )}
          {isLastStep && embedded && (
            <Button onClick={() => router.refresh()}>
              <Check className="mr-1.5 size-4" />
              Cek progress
            </Button>
          )}
        </div>
      </div>

      <div className="border-warm-200 border-t pt-4 text-center">
        <button
          type="button"
          onClick={dismissChecklist}
          disabled={busy !== null}
          className="text-warm-500 hover:text-warm-700 text-xs"
        >
          Tutup panduan permanen (bisa di-buka ulang dari Dashboard)
        </button>
      </div>
    </div>
  )
}
