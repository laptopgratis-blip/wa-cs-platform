'use client'

// Horizontal funnel chart — semua step visualisasi sebagai bar % dari step
// pertama (visitor). Drop-off antar step dihighlight di label.
//
// Dibuat custom (no recharts) supaya control penuh + tidak pull in extra lib
// untuk view sederhana. Style match warna Hulao.

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
              <div className="font-medium text-warm-700 dark:text-warm-200">
                <span className="mr-1.5 inline-block size-5 rounded-full bg-primary-100 text-center text-[11px] font-bold leading-5 text-primary-700">
                  {idx + 1}
                </span>
                {s.step}
              </div>
              <div className="tabular-nums text-warm-600">
                <span className="font-semibold text-warm-900 dark:text-warm-50">
                  {s.count.toLocaleString('id-ID')}
                </span>
                <span className="ml-1.5 text-warm-400">
                  ({pct.toFixed(1)}%)
                </span>
                {dropPct !== null && dropPct > 0 && (
                  <span className="ml-2 text-rose-600">
                    −{dropPct.toFixed(0)}%
                  </span>
                )}
              </div>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-warm-100 dark:bg-warm-800">
              <div
                className={`h-full rounded-full transition-all ${
                  idx === 0
                    ? 'bg-primary-500'
                    : idx === steps.length - 1
                      ? 'bg-emerald-500'
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
