'use client'

// Score-over-time line chart — anchor points di setiap optimization apply.
// Native SVG no-deps; data point ≤ ~90 cocok untuk simple line chart.
import { Loader2, TrendingUp } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

interface Point {
  total: number
  computedAt: string
  trigger: string
  sampleVisits: number
}

interface ApplyMarker {
  id: string
  appliedAt: string
  scoreBefore: number | null
  scoreAfter: number | null
}

interface HistoryData {
  days: number
  points: Point[]
  applyMarkers: ApplyMarker[]
}

interface Props {
  lpId: string
}

export function ScoreHistoryChart({ lpId }: Props) {
  const [data, setData] = useState<HistoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState<7 | 30 | 90>(30)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/lp/${encodeURIComponent(lpId)}/score/history?days=${days}`, {
      cache: 'no-store',
    })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        if (j.success) setData(j.data as HistoryData)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [lpId, days])

  const chart = useMemo(() => {
    if (!data || data.points.length === 0) return null
    const W = 720
    const H = 220
    const PAD_X = 40
    const PAD_Y = 24

    const minTs = new Date(data.points[0]!.computedAt).getTime()
    const maxTs = new Date(data.points[data.points.length - 1]!.computedAt).getTime()
    const tsRange = Math.max(1, maxTs - minTs)

    const xOf = (iso: string) => {
      const t = new Date(iso).getTime()
      return PAD_X + ((t - minTs) / tsRange) * (W - PAD_X * 2)
    }
    const yOf = (score: number) =>
      H - PAD_Y - (score / 100) * (H - PAD_Y * 2)

    const path = data.points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(p.computedAt).toFixed(1)} ${yOf(p.total).toFixed(1)}`)
      .join(' ')

    return { W, H, PAD_X, PAD_Y, xOf, yOf, path, minTs, maxTs }
  }, [data])

  return (
    <div className="rounded-xl border border-warm-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-display text-sm font-semibold text-warm-900">
          <TrendingUp className="mr-1 inline size-4" /> Score Over Time
        </h3>
        <div className="flex gap-0.5 rounded-md border border-warm-300 p-0.5">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d as 7 | 30 | 90)}
              className={`rounded px-2 py-0.5 text-xs ${
                days === d
                  ? 'bg-primary-500 text-white'
                  : 'text-warm-600 hover:bg-warm-100'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8 text-warm-500">
          <Loader2 className="mr-2 size-4 animate-spin" /> Memuat…
        </div>
      )}

      {!loading && (!data || data.points.length === 0) && (
        <div className="rounded border border-dashed border-warm-200 bg-warm-50 py-8 text-center text-xs text-warm-500">
          Belum ada history score di window {days} hari. Score akan ter-record
          tiap cron daily atau saat user klik refresh.
        </div>
      )}

      {!loading && data && data.points.length > 0 && chart && (
        <>
          <svg
            viewBox={`0 0 ${chart.W} ${chart.H}`}
            className="w-full"
            preserveAspectRatio="xMinYMin meet"
          >
            {/* Y-axis grid lines */}
            {[0, 25, 50, 75, 100].map((v) => (
              <g key={v}>
                <line
                  x1={chart.PAD_X}
                  x2={chart.W - chart.PAD_X}
                  y1={chart.yOf(v)}
                  y2={chart.yOf(v)}
                  className="stroke-warm-200"
                  strokeWidth={1}
                  strokeDasharray={v === 0 || v === 100 ? '' : '2,4'}
                />
                <text
                  x={chart.PAD_X - 4}
                  y={chart.yOf(v) + 3}
                  textAnchor="end"
                  className="fill-warm-500 text-[10px]"
                >
                  {v}
                </text>
              </g>
            ))}

            {/* Apply markers — vertical line + label */}
            {data.applyMarkers.map((m) => {
              const x = chart.xOf(m.appliedAt)
              return (
                <g key={m.id}>
                  <line
                    x1={x}
                    x2={x}
                    y1={chart.PAD_Y}
                    y2={chart.H - chart.PAD_Y}
                    className="stroke-purple-300"
                    strokeWidth={1}
                    strokeDasharray="3,3"
                  />
                  <circle
                    cx={x}
                    cy={chart.PAD_Y - 6}
                    r={5}
                    className="fill-purple-500"
                  >
                    <title>
                      AI apply{m.scoreBefore && m.scoreAfter
                        ? `: ${m.scoreBefore} → ${m.scoreAfter}`
                        : ''}
                    </title>
                  </circle>
                </g>
              )
            })}

            {/* Score line */}
            <path
              d={chart.path}
              fill="none"
              className="stroke-primary-500"
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Data points */}
            {data.points.map((p, i) => (
              <circle
                key={i}
                cx={chart.xOf(p.computedAt)}
                cy={chart.yOf(p.total)}
                r={3}
                className="fill-primary-600"
              >
                <title>
                  {p.total}/100 · {new Date(p.computedAt).toLocaleString('id-ID')}{' '}
                  · trigger:{p.trigger} · {p.sampleVisits} visit
                </title>
              </circle>
            ))}

            {/* X-axis labels — first & last date */}
            <text
              x={chart.PAD_X}
              y={chart.H - 4}
              className="fill-warm-500 text-[10px]"
            >
              {new Date(chart.minTs).toLocaleDateString('id-ID', {
                day: '2-digit',
                month: 'short',
              })}
            </text>
            <text
              x={chart.W - chart.PAD_X}
              y={chart.H - 4}
              textAnchor="end"
              className="fill-warm-500 text-[10px]"
            >
              {new Date(chart.maxTs).toLocaleDateString('id-ID', {
                day: '2-digit',
                month: 'short',
              })}
            </text>
          </svg>
          <div className="mt-2 flex items-center gap-3 text-[11px] text-warm-500">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-primary-500" />
              Score
            </span>
            {data.applyMarkers.length > 0 && (
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-purple-500" />
                AI Optimization Apply ({data.applyMarkers.length}×)
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
