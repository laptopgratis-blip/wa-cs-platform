'use client'

// Horizontal funnel chart — semua step visualisasi sebagai bar % dari step
// pertama (visitor). Drop-off antar step dihighlight di label.
//
// Dibuat custom (no recharts) supaya control penuh + tidak pull in extra lib
// untuk view sederhana. Style match warna Hulao.

import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

interface Step {
  step: string
  count: number
}

interface Props {
  steps: Step[]
}

export function FunnelChart({ steps }: Props) {
  if (steps.length === 0) return null
  const total = steps[0]?.count ?? 0

  return (
    <div className="space-y-2.5">
      {steps.map((s, idx) => {
        const pct = total > 0 ? (s.count / total) * 100 : 0
        const prevCount = idx > 0 ? (steps[idx - 1]?.count ?? 0) : null
        const dropPct =
          prevCount !== null && prevCount > 0
            ? ((prevCount - s.count) / prevCount) * 100
            : null
        return (
          <div key={s.step}>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <div className="text-warm-700 font-medium">
                <span className="bg-primary-100 text-primary-700 mr-1.5 inline-block size-5 rounded-full text-center text-xs leading-5 font-bold">
                  {idx + 1}
                </span>
                {s.step}
              </div>
              <div className="text-warm-600 tabular-nums">
                <span className="text-warm-900 font-semibold">
                  {s.count.toLocaleString('id-ID')}
                </span>
                <span className="text-warm-400 ml-1.5">
                  ({pct.toFixed(1)}%)
                </span>
                {dropPct !== null && dropPct > 0 && (
                  <span className={cn('ml-2', TONES.danger.text)}>
                    −{dropPct.toFixed(0)}%
                  </span>
                )}
              </div>
            </div>
            <div className="bg-warm-100 h-2.5 w-full overflow-hidden rounded-full">
              <div
                className={`h-full rounded-full transition-all ${
                  idx === 0
                    ? 'bg-primary-500'
                    : idx === steps.length - 1
                      ? 'bg-primary-600'
                      : 'bg-primary-300'
                }`}
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
