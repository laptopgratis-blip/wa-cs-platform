'use client'

// OnboardingProgressCard — render langsung dari prop (data di-fetch server-
// side di dashboard page). Tidak ada client fetch / loading state biar
// tidak ada flash atau race condition. Kalau goal nggak ada (initialData=null)
// → return null. Kalau user nggak punya goal, card hidden.
//
// Variant:
//  - allRequiredDone → emerald celebration card dgn tombol X dismiss
//  - in progress → big rocket card "Lanjutkan goal kamu" — tidak bisa dismiss
//    (dismiss khusus celebration). Tujuan: wizard selalu accessible sampai
//    user beneran selesai.
import { ArrowRight, PartyPopper, Rocket, X } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export interface OnboardingProgressData {
  title: string
  progressPct: number
  allRequiredDone: boolean
  totalSteps: number
  completedSteps: number
  remainingSteps: number
}

interface Props {
  /**
   * Data progress dari server. Null = user belum pilih goal → card hidden.
   */
  initialData: OnboardingProgressData | null
}

export function OnboardingProgressCard({ initialData }: Props) {
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)

  async function dismiss() {
    setBusy(true)
    try {
      const res = await fetch('/api/onboarding/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss' }),
      })
      if (!res.ok) throw new Error('Gagal')
      setHidden(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal'
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  if (!initialData || hidden) return null

  const data = initialData

  // ─── Variant ALL DONE — celebration card, dengan X dismiss permanen ──
  if (data.allRequiredDone) {
    return (
      <Card className="overflow-hidden rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 shadow-sm">
        <div className="flex items-center gap-4 p-5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-orange">
            <PartyPopper className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-extrabold text-warm-900">
              Setup selesai 🎉
            </h2>
            <p className="text-sm text-warm-600">
              Semua langkah utama untuk <strong>{data.title}</strong> sudah selesai.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/onboarding/guide">Lihat ulang</Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="size-8 p-0 text-warm-500 hover:text-rose-600"
            onClick={dismiss}
            disabled={busy}
            aria-label="Tutup permanen"
            title="Hapus card ini permanen"
          >
            <X className="size-4" />
          </Button>
        </div>
      </Card>
    )
  }

  // ─── Variant IN PROGRESS — selalu standout, tidak bisa dismiss ──────
  return (
    <Card className="relative overflow-hidden rounded-2xl border-2 border-primary-300 bg-gradient-to-br from-primary-50 via-orange-50 to-amber-50 shadow-lg">
      <div
        aria-hidden
        className="absolute -right-16 -top-16 size-48 rounded-full bg-primary-200/40 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute -bottom-12 -left-12 size-40 rounded-full bg-orange-200/40 blur-3xl"
      />

      <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-orange-500 text-white shadow-orange">
          <Rocket className="size-7" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="font-display text-lg font-extrabold tracking-tight text-warm-900 sm:text-xl">
              Lanjutkan goal kamu
            </h2>
            <span className="rounded-full bg-primary-500 px-2.5 py-0.5 text-xs font-bold text-white">
              {data.remainingSteps > 0
                ? `${data.remainingSteps} langkah lagi`
                : 'Hampir selesai!'}
            </span>
          </div>
          <p className="mt-0.5 text-sm font-medium text-warm-700">
            {data.title}
          </p>
          <div className="mt-2.5 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/70 ring-1 ring-warm-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary-500 to-orange-500 transition-all"
                style={{ width: `${data.progressPct}%` }}
              />
            </div>
            <span className="text-xs font-bold text-warm-800 tabular-nums">
              {data.completedSteps}/{data.totalSteps} ({data.progressPct}%)
            </span>
          </div>
        </div>

        <Button
          asChild
          size="lg"
          className="shrink-0 bg-primary-500 px-5 font-bold shadow-orange hover:bg-primary-600"
        >
          <Link href="/onboarding/guide">
            Lanjut setup <ArrowRight className="ml-1.5 size-4" />
          </Link>
        </Button>
      </div>
    </Card>
  )
}
