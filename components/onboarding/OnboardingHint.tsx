'use client'

// OnboardingHint — banner tipis kontekstual di top halaman fitur. Hanya
// tampil kalau:
//   1. User punya goal yang match `relevantFor` dan belum dismiss hint ini
//   2. Atau user goal tidak match → tampilkan banner amber kecil "Fitur ini
//      umumnya dipakai untuk X" supaya user tidak nyasar
//
// Self-fetching state via /api/onboarding/checklist — endpoint sama yang
// dipakai dashboard checklist. Tidak butuh prop drilling.
import { Lightbulb, Sparkles, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

type Goal = 'CS_AI' | 'SELL_LP' | 'SELL_WA' | 'LMS'

interface OnboardingHintProps {
  /** Identifier unik per hint, untuk tracking dismiss di sessionStorage. */
  hintId: string
  /** Goal user yang relevan dengan halaman ini. */
  relevantFor: Goal[]
  /** Pesan utama saat goal user MATCH. */
  matchMessage: string
  /** Optional: link CTA saat match. */
  matchCta?: { label: string; href: string }
  /**
   * Pesan saat goal user TIDAK match. Default null = tidak tampilkan banner
   * apa pun (biar tidak ganggu).
   */
  mismatchMessage?: string
}

interface ChecklistData {
  goal?: Goal
}

export function OnboardingHint({
  hintId,
  relevantFor,
  matchMessage,
  matchCta,
  mismatchMessage,
}: OnboardingHintProps) {
  const [goal, setGoal] = useState<Goal | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const v = window.sessionStorage.getItem(`hulao.hint.${hintId}`)
        if (v === '1') {
          setDismissed(true)
        }
      } catch {
        /* abaikan */
      }
    }

    fetch('/api/onboarding/checklist', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { checklist: ChecklistData | null } | null) => {
        if (j?.checklist?.goal) setGoal(j.checklist.goal)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [hintId])

  function dismiss() {
    setDismissed(true)
    try {
      window.sessionStorage.setItem(`hulao.hint.${hintId}`, '1')
    } catch {
      /* abaikan */
    }
  }

  if (!loaded || dismissed) return null
  if (!goal) return null

  const isMatch = relevantFor.includes(goal)

  if (!isMatch && !mismatchMessage) return null

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3 text-sm',
        isMatch
          ? 'border-primary-200 bg-primary-50 text-primary-900'
          : 'border-amber-200 bg-amber-50 text-amber-900',
      )}
    >
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-md',
          isMatch ? 'bg-primary-500 text-white' : 'bg-amber-500 text-white',
        )}
      >
        {isMatch ? (
          <Sparkles className="size-3.5" />
        ) : (
          <Lightbulb className="size-3.5" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="leading-relaxed">{isMatch ? matchMessage : mismatchMessage}</p>
        {isMatch && matchCta && (
          <Link
            href={matchCta.href}
            className="mt-1 inline-flex items-center text-xs font-semibold underline-offset-2 hover:underline"
          >
            {matchCta.label} →
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Tutup"
        className={cn(
          'shrink-0 rounded-md p-1 transition-colors',
          isMatch
            ? 'text-primary-700 hover:bg-primary-100'
            : 'text-amber-800 hover:bg-amber-100',
        )}
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
