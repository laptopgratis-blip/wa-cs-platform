'use client'

// Score gauge — radial progress 0-100 dengan breakdown bar per dimensi.
// Confidence indicator (low/medium/high) tampil sebagai chip kecil.
//
// History line chart (mini) di sub-component — di tab terpisah supaya tidak
// crowded di gauge utama.
import { Activity, AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { TONES, type Tone } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

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

// Bar per dimensi hanya perlu dibedakan satu sama lain, bukan menyandang
// makna status — jadi pakai gradasi shade brand.
const DIM_COLOR: Record<string, string> = {
  traffic: 'bg-primary-700',
  engagement: 'bg-primary-600',
  conversion: 'bg-primary-500',
  content: 'bg-primary-400',
  technical: 'bg-primary-300',
  sentiment: 'bg-primary-200',
}

// Tingkat keparahan score → tone registry (lib/ui-tones.ts).
function scoreTone(score: number): Tone {
  if (score >= 80) return 'success'
  if (score >= 60) return 'info'
  if (score >= 40) return 'warning'
  return 'danger'
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
      <Card>
        <CardContent className="text-warm-500 flex items-center justify-center gap-2 py-8">
          <Loader2 className="size-4 animate-spin" /> Menghitung score…
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return (
      <div className="text-warm-500 rounded-lg border border-dashed p-4 text-center text-sm">
        Score belum tersedia. Coba klik refresh.
      </div>
    )
  }

  const confidenceLow = data.sampleVisits < data.meta.confidenceThresholdVisits

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 md:flex-row md:items-start">
        {/* Radial gauge */}
        <div className="shrink-0">
          <RadialGauge score={data.total} />
          <div className="mt-2 flex justify-center">
            <StatusBadge
              tone={scoreTone(data.total)}
              label={scoreLabel(data.total)}
            />
          </div>
        </div>

        {/* Breakdown bars */}
        <div className="flex-1 space-y-2 self-stretch">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-display text-warm-900 text-sm font-semibold">
              <Activity className="mr-1 inline size-4" /> LP Score Breakdown
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-warm-500 text-xs">
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
                <div className="mb-0.5 flex items-baseline justify-between text-xs">
                  <span className="text-warm-700 font-medium">{label}</span>
                  <span className="text-warm-600 tabular-nums">
                    <span className="text-warm-900 font-semibold">
                      {dim.score}
                    </span>
                    /{dim.max}
                  </span>
                </div>
                <div className="bg-warm-100 h-2 w-full overflow-hidden rounded-full">
                  <div
                    className={`h-full rounded-full ${DIM_COLOR[key]} transition-all`}
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </div>
                <p className="text-warm-500 mt-0.5 text-xs">{dim.detail}</p>
              </div>
            )
          })}

          {confidenceLow && (
            <div
              className={cn(
                'mt-2 flex items-start gap-2 rounded-md border p-2 text-xs',
                TONES.warning.bg,
                TONES.warning.border,
                TONES.warning.text,
              )}
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <div>
                Data minim ({data.sampleVisits} visit). Score belum reliable —
                butuh min {data.meta.confidenceThresholdVisits} visit untuk
                confidence cukup.
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
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
          className={cn('stroke-current', TONES[scoreTone(score)].text)}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 600ms ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-1">
        <span
          className={cn(
            'font-display text-3xl font-bold tabular-nums',
            TONES[scoreTone(score)].text,
          )}
        >
          {score}
        </span>
        <span className="text-warm-500 text-xs font-medium">/ 100</span>
      </div>
    </div>
  )
}
