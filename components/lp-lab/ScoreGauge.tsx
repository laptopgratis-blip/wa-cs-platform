'use client'

// Score gauge — radial progress 0-100 dengan breakdown bar per dimensi.
// Confidence indicator (low/medium/high) tampil sebagai chip kecil.
//
// History line chart (mini) di sub-component — di tab terpisah supaya tidak
// crowded di gauge utama.
import {
  Activity,
  AlertTriangle,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface DimensionScore {
  score: number
  max: number
  detail: string
}

interface ScoreData {
  total: number
  breakdown: {
    traffic: DimensionScore
    engagement: DimensionScore
    conversion: DimensionScore
    content: DimensionScore
    technical: DimensionScore
    sentiment: DimensionScore
  }
  periodDays: number
  sampleVisits: number
  trigger: string
  computedAt: string
  meta: {
    weights: Record<string, number>
    labels: Record<string, string>
    confidenceThresholdVisits: number
  }
}

interface Props {
  lpId: string
  /** Trigger refetch dari parent (mis. setelah apply optimization). */
  refreshKey?: number
}

const DIM_KEYS: Array<keyof ScoreData['breakdown']> = [
  'traffic',
  'engagement',
  'conversion',
  'content',
  'technical',
  'sentiment',
]

const DIM_COLOR: Record<string, string> = {
  traffic: 'bg-sky-500',
  engagement: 'bg-violet-500',
  conversion: 'bg-emerald-500',
  content: 'bg-amber-500',
  technical: 'bg-slate-500',
  sentiment: 'bg-pink-500',
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600'
  if (score >= 60) return 'text-amber-600'
  if (score >= 40) return 'text-orange-600'
  return 'text-rose-600'
}

function scoreBg(score: number): string {
  if (score >= 80) return 'stroke-emerald-500'
  if (score >= 60) return 'stroke-amber-500'
  if (score >= 40) return 'stroke-orange-500'
  return 'stroke-rose-500'
}

function scoreLabel(score: number): string {
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Good'
  if (score >= 40) return 'Needs work'
  return 'Critical'
}

export function ScoreGauge({ lpId, refreshKey = 0 }: Props) {
  const [data, setData] = useState<ScoreData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/lp/${encodeURIComponent(lpId)}/score`, {
        cache: 'no-store',
      })
      const j = await res.json()
      if (j.success) setData(j.data as ScoreData)
    } catch {
      /* swallow */
    } finally {
      setLoading(false)
    }
  }, [lpId])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  async function handleRecompute() {
    setRefreshing(true)
    try {
      const res = await fetch(`/api/lp/${encodeURIComponent(lpId)}/score`, {
        method: 'POST',
      })
      const j = await res.json()
      if (j.success) {
        toast.success(`Score di-recompute: ${j.data.total}/100`)
        await load()
      } else {
        toast.error(j.error ?? 'Gagal recompute')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-warm-200 bg-white py-8 text-warm-500">
        <Loader2 className="mr-2 size-5 animate-spin" /> Menghitung score…
      </div>
    )
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-sm text-warm-500">
        Score belum tersedia. Coba klik refresh.
      </div>
    )
  }

  const confidenceLow = data.sampleVisits < data.meta.confidenceThresholdVisits

  return (
    <div className="rounded-xl border-2 border-warm-200 bg-gradient-to-br from-white to-warm-50 p-4 shadow-sm">
      <div className="flex flex-col items-center gap-4 md:flex-row md:items-start">
        {/* Radial gauge */}
        <div className="shrink-0">
          <RadialGauge score={data.total} />
          <div className="mt-2 text-center">
            <Badge
              variant="outline"
              className={`text-xs font-semibold ${scoreColor(data.total)}`}
            >
              {scoreLabel(data.total)}
            </Badge>
          </div>
        </div>

        {/* Breakdown bars */}
        <div className="flex-1 space-y-2 self-stretch">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-warm-900">
              <Activity className="mr-1 inline size-4" /> LP Score Breakdown
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-warm-500">
                {data.sampleVisits} visit · {data.periodDays}d
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => void handleRecompute()}
                disabled={refreshing}
                title="Recompute score sekarang"
              >
                {refreshing ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <RefreshCw className="size-3" />
                )}
              </Button>
            </div>
          </div>

          {DIM_KEYS.map((key) => {
            const dim = data.breakdown[key]
            const pct = (dim.score / dim.max) * 100
            const label = data.meta.labels[key] ?? key
            return (
              <div key={key} title={dim.detail}>
                <div className="mb-0.5 flex items-baseline justify-between text-[11px]">
                  <span className="font-medium text-warm-700">{label}</span>
                  <span className="tabular-nums text-warm-600">
                    <span className="font-semibold text-warm-900">
                      {dim.score}
                    </span>
                    /{dim.max}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-warm-100">
                  <div
                    className={`h-full rounded-full ${DIM_COLOR[key]} transition-all`}
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </div>
                <p className="mt-0.5 text-[10px] text-warm-500">{dim.detail}</p>
              </div>
            )
          })}

          {confidenceLow && (
            <div className="mt-2 flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <div>
                Data minim ({data.sampleVisits} visit). Score belum reliable —
                butuh min {data.meta.confidenceThresholdVisits} visit untuk
                confidence cukup.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Radial gauge SVG — 80% complete arc dari -135° ke +135° (semicircular).
function RadialGauge({ score }: { score: number }) {
  const size = 120
  const stroke = 12
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  // Arc 270° = 75% of circle.
  const arcLength = circumference * 0.75
  const offset = arcLength * (1 - score / 100)
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-[135deg]">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-warm-200"
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
        />
        {/* Filled arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className={scoreBg(score)}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 600ms ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-1">
        <span
          className={`font-display text-3xl font-extrabold tabular-nums ${scoreColor(score)}`}
        >
          {score}
        </span>
        <span className="text-[10px] font-medium text-warm-500">/ 100</span>
      </div>
    </div>
  )
}
