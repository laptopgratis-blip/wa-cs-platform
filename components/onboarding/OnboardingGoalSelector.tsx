'use client'

// OnboardingGoalSelector — tampilkan SEMUA 4 goal sebagai card di dashboard
// supaya user bisa switch fokus kapan saja. Goal aktif punya checkmark hijau.
// Klik goal lain → buka AlertDialog konfirmasi (Radix) untuk visual yg jelas
// (browser confirm() sering ke-block atau user awam tidak sadar).
//
// Pakai endpoint existing /api/onboarding/save-goal — set goal baru →
// onboardingDismissedAt=null otomatis (checklist muncul lagi). Progress step
// di JSON tidak hilang, step yg tidak match goal baru auto-ignored saat resolve.
import { ArrowRight, Check, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Goal = 'CS_AI' | 'SELL_LP' | 'SELL_WA' | 'LMS'

interface GoalOption {
  id: Goal
  emoji: string
  title: string
  short: string
  /** Background gradient class — flat strings, full Tailwind classes. */
  bgClass: string
  /** Border idle. */
  borderClass: string
  /** Border + ring saat aktif. */
  activeRingClass: string
}

const OPTIONS: GoalOption[] = [
  {
    id: 'CS_AI',
    emoji: '🤖',
    title: 'CS AI',
    short: 'WhatsApp dijawab otomatis 24 jam',
    bgClass: 'bg-gradient-to-br from-blue-50 to-indigo-50',
    borderClass: 'border-blue-200',
    activeRingClass: 'border-blue-500 ring-2 ring-blue-300',
  },
  {
    id: 'SELL_LP',
    emoji: '🛒',
    title: 'Jualan + LP',
    short: 'Landing page + form order + ongkir + follow-up',
    bgClass: 'bg-gradient-to-br from-orange-50 to-amber-50',
    borderClass: 'border-orange-200',
    activeRingClass: 'border-orange-500 ring-2 ring-orange-300',
  },
  {
    id: 'SELL_WA',
    emoji: '💬',
    title: 'Jualan WA',
    short: 'AI guide pelanggan langsung di WhatsApp',
    bgClass: 'bg-gradient-to-br from-emerald-50 to-teal-50',
    borderClass: 'border-emerald-200',
    activeRingClass: 'border-emerald-500 ring-2 ring-emerald-300',
  },
  {
    id: 'LMS',
    emoji: '🎓',
    title: 'Course / LMS',
    short: 'Bikin course online + akses otomatis',
    bgClass: 'bg-gradient-to-br from-purple-50 to-fuchsia-50',
    borderClass: 'border-purple-200',
    activeRingClass: 'border-purple-500 ring-2 ring-purple-300',
  },
]

const GOAL_VERBOSE: Record<Goal, string> = {
  CS_AI: 'CS AI saja',
  SELL_LP: 'Jualan dengan Landing Page',
  SELL_WA: 'Jualan langsung di WhatsApp',
  LMS: 'Course / produk digital (LMS)',
}

interface Props {
  /** Goal user sekarang. Null = belum pilih (existing user atau dismissed). */
  currentGoal: Goal | null
  /**
   * Render versi kompak — heading kecil, cards lebih ringkas, default
   * collapsed kalau tidak ada goal aktif. Dipakai di dashboard footer
   * supaya tidak kompetisi dengan hero card LP gratis.
   */
  compact?: boolean
}

export function OnboardingGoalSelector({ currentGoal, compact }: Props) {
  const router = useRouter()
  const [pending, setPending] = useState<Goal | null>(null) // goal yg lagi di-confirm
  const [busy, setBusy] = useState(false)
  // Compact mode: collapse default kalau belum ada goal aktif. Kalau ada
  // goal aktif, expand supaya user lihat status aktifnya tanpa klik.
  const [expanded, setExpanded] = useState(!compact || currentGoal !== null)

  function requestSelect(goal: Goal) {
    if (goal === currentGoal) {
      toast.info('Tujuan ini sudah aktif sekarang')
      return
    }
    setPending(goal)
  }

  async function confirmSelect() {
    if (!pending) return
    setBusy(true)
    try {
      const res = await fetch('/api/onboarding/save-goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: pending, isSkip: false }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Gagal switch goal')
      }
      toast.success(`Tujuan diubah ke ${GOAL_VERBOSE[pending]} — panduan auto-update`)
      setPending(null)
      // Wizard sudah inline di dashboard — cukup refresh supaya
      // EmbeddedOnboardingGuide re-render dengan goal baru. Reset ?step=1
      // supaya mulai dari step pertama goal yang baru dipilih.
      router.replace('/dashboard?step=1')
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal switch goal'
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card className={cn('rounded-xl border-warm-200 shadow-sm', compact && 'border-warm-200/70 bg-warm-50/30')}>
        <CardHeader
          className={cn('pb-3', compact && 'cursor-pointer pb-2')}
          onClick={compact ? () => setExpanded((v) => !v) : undefined}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className={cn('font-display', compact ? 'text-sm' : 'text-lg')}>
                🎯 Setup lengkap untuk fitur lain
              </CardTitle>
              {compact ? (
                <CardDescription className="text-xs">
                  CS AI · Jualan WA · Course/LMS · setup lebih lengkap (di luar
                  LP gratis)
                </CardDescription>
              ) : (
                <CardDescription>
                  Tujuan aktif sekarang punya badge ✓. Klik{' '}
                  <strong>Jadikan tujuan</strong> di card lain untuk switch fokus —
                  checklist & panduan menyesuaikan otomatis.
                </CardDescription>
              )}
            </div>
            {compact && (
              <button
                type="button"
                aria-label={expanded ? 'Ciutkan' : 'Buka'}
                className="rounded p-1 text-warm-500 hover:bg-warm-100 hover:text-warm-900"
                onClick={(e) => {
                  e.stopPropagation()
                  setExpanded((v) => !v)
                }}
              >
                {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </button>
            )}
          </div>
        </CardHeader>
        {expanded && (
          <CardContent className={cn(compact && 'pt-0')}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {OPTIONS.map((opt) => {
                const isActive = opt.id === currentGoal
                return (
                  <div
                    key={opt.id}
                    className={cn(
                      'relative flex flex-col rounded-xl border-2 transition-shadow',
                      compact ? 'gap-2 p-3' : 'gap-3 p-4',
                      opt.bgClass,
                      isActive ? opt.activeRingClass : opt.borderClass,
                    )}
                  >
                    {isActive && (
                      <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                        <Check className="size-3" /> Aktif
                      </span>
                    )}
                    <span className={cn(compact ? 'text-xl' : 'text-3xl')} aria-hidden>
                      {opt.emoji}
                    </span>
                    <div className="flex-1">
                      <p
                        className={cn(
                          'font-display font-bold leading-tight text-warm-900',
                          compact ? 'text-xs' : 'text-base',
                        )}
                      >
                        {opt.title}
                      </p>
                      <p
                        className={cn(
                          'mt-0.5 text-warm-600',
                          compact ? 'line-clamp-2 text-[10px]' : 'mt-1 text-xs',
                        )}
                      >
                        {opt.short}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={isActive ? 'outline' : 'default'}
                      disabled={isActive || busy}
                      onClick={() => requestSelect(opt.id)}
                      className={cn('w-full', compact && 'h-7 text-[11px]')}
                    >
                      {isActive ? (
                        'Sedang aktif'
                      ) : (
                        <>
                          {compact ? 'Pilih' : 'Jadikan tujuan'}
                          <ArrowRight className="ml-1 size-3.5" />
                        </>
                      )}
                    </Button>
                  </div>
                )
              })}
            </div>
            {!compact && (
              <p className="mt-3 text-xs text-warm-500">
                💡 Switching goal tidak menghapus progress lama. Kamu bisa balik
                kapan saja — step yang sudah selesai tetap kebaca.
              </p>
            )}
          </CardContent>
        )}
      </Card>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setPending(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Ganti tujuan ke {pending ? GOAL_VERBOSE[pending] : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  {currentGoal ? (
                    <>
                      Fokus saat ini: <strong>{GOAL_VERBOSE[currentGoal]}</strong>.
                      Setelah diganti, checklist & menu di sidebar akan
                      menyesuaikan tujuan baru.
                    </>
                  ) : (
                    <>
                      Setelah set, checklist & menu di sidebar akan menyesuaikan
                      tujuan ini.
                    </>
                  )}
                </p>
                <p className="text-xs text-warm-500">
                  Progress step yang sudah selesai tidak hilang — kalau balik
                  ke tujuan lama, otomatis kebawa.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void confirmSelect()
              }}
              disabled={busy}
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> Memproses…
                </>
              ) : (
                'Ya, ubah tujuan'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
