'use client'

// Generic breakdown list — items dengan count, render sebagai daftar dengan
// bar proportional (%-of-max). Dipakai oleh tab Sources, Devices, CTAs, dll.

interface Item {
  key: string
  count: number
}

interface Props {
  items: Item[]
  maxRows?: number // default 10
}

export function BreakdownList({ items, maxRows = 10 }: Props) {
  if (items.length === 0) return null
  const max = Math.max(...items.map((i) => i.count), 1)
  const rows = items.slice(0, maxRows)
  const total = items.reduce((sum, i) => sum + i.count, 0)
  return (
    <div className="space-y-1.5">
      {rows.map((it) => {
        const pct = (it.count / max) * 100
        const sharePct = total > 0 ? (it.count / total) * 100 : 0
        return (
          <div key={it.key} className="text-xs">
            <div className="mb-0.5 flex items-baseline justify-between gap-2">
              <span
                className="truncate font-medium text-warm-700 dark:text-warm-200"
                title={it.key}
              >
                {it.key}
              </span>
              <span className="shrink-0 tabular-nums text-warm-500">
                <span className="font-semibold text-warm-900 dark:text-warm-50">
                  {it.count.toLocaleString('id-ID')}
                </span>
                <span className="ml-1 text-warm-400">
                  ({sharePct.toFixed(1)}%)
                </span>
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-warm-100 dark:bg-warm-800">
              <div
                className="h-full rounded-full bg-primary-400"
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
          </div>
        )
      })}
      {items.length > maxRows && (
        <p className="pt-1 text-[11px] text-warm-400">
          +{items.length - maxRows} lainnya tidak ditampilkan
        </p>
      )}
    </div>
  )
}
