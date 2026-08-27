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
                className="text-warm-700 truncate font-medium"
                title={it.key}
              >
                {it.key}
              </span>
              <span className="text-warm-500 shrink-0 tabular-nums">
                <span className="text-warm-900 font-semibold">
                  {it.count.toLocaleString('id-ID')}
                </span>
                <span className="text-warm-400 ml-1">
                  ({sharePct.toFixed(1)}%)
                </span>
              </span>
            </div>
            <div className="bg-warm-100 h-1.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary-400 h-full rounded-full"
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
          </div>
        )
      })}
      {items.length > maxRows && (
        <p className="text-warm-400 pt-1 text-xs">
          +{items.length - maxRows} lainnya tidak ditampilkan
        </p>
      )}
    </div>
  )
}
