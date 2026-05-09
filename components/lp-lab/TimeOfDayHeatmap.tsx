'use client'

// 7×24 grid heatmap — kapan visitor paling sering datang.
// dow: 0=Sunday s/d 6=Saturday (Postgres EXTRACT(DOW) convention).
// hour: 0-23 di timezone Asia/Jakarta (server sudah convert).
// Cell color intensity by count relative to max in dataset.

interface Cell {
  dow: number
  hour: number
  count: number
}

interface Props {
  cells: Cell[]
}

const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

export function TimeOfDayHeatmap({ cells }: Props) {
  if (cells.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-warm-200 bg-warm-50 px-3 py-4 text-center text-xs text-warm-500">
        Belum ada visit untuk dibreakdown by waktu.
      </p>
    )
  }
  const max = Math.max(...cells.map((c) => c.count), 1)
  // Build map dow:hour -> count untuk render cepat.
  const grid = new Map<string, number>()
  for (const c of cells) grid.set(`${c.dow}:${c.hour}`, c.count)

  // Hour labels — show every 3 jam supaya tidak crowded.
  const hourLabels = Array.from({ length: 24 }, (_, i) => i)

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        {/* Hour header */}
        <div className="flex">
          <div className="w-10 shrink-0" />
          {hourLabels.map((h) => (
            <div
              key={h}
              className="flex-1 text-center text-[10px] tabular-nums text-warm-400"
              style={{ minWidth: '14px' }}
            >
              {h % 3 === 0 ? h : ''}
            </div>
          ))}
        </div>
        {/* Rows per day */}
        {DAY_LABELS.map((label, dow) => (
          <div key={dow} className="flex items-center">
            <div className="w-10 shrink-0 text-[11px] font-medium text-warm-500">
              {label}
            </div>
            {hourLabels.map((h) => {
              const count = grid.get(`${dow}:${h}`) ?? 0
              const intensity = count / max // 0..1
              return (
                <div
                  key={h}
                  className="flex-1 p-0.5"
                  style={{ minWidth: '14px' }}
                  title={`${label} ${h}:00 — ${count} visit`}
                >
                  <div
                    className="aspect-square rounded-sm"
                    style={{
                      backgroundColor:
                        count === 0
                          ? 'rgb(245 245 244)' // warm-100
                          : `rgba(234, 88, 12, ${0.15 + intensity * 0.85})`,
                    }}
                  />
                </div>
              )
            })}
          </div>
        ))}
        {/* Legend */}
        <div className="mt-2 flex items-center gap-2 text-[10px] text-warm-500">
          <span>Sedikit</span>
          <div className="flex gap-0.5">
            {[0.15, 0.35, 0.55, 0.75, 1].map((i) => (
              <div
                key={i}
                className="size-3 rounded-sm"
                style={{ backgroundColor: `rgba(234, 88, 12, ${i})` }}
              />
            ))}
          </div>
          <span>Banyak</span>
          <span className="ml-3 text-warm-400">Max: {max} visit</span>
        </div>
      </div>
    </div>
  )
}
