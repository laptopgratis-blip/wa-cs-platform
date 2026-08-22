'use client'

// InsightsTab — agregat performance konten user. Show:
// - Summary card: total konten dgn metric, total reach
// - Best performer cards: by channel, by funnel, by method (sorted avg reach)
// - Top 3 winner pieces dgn full metric
// - Empty state edukatif kalau belum ada metric
import {
  BarChart3,
  Bookmark,
  Crown,
  Link2,
  Loader2,
  MessageCircle,
  Send,
  Share2,
  Sparkles,
  Trophy,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { EmptyState } from '@/components/shared/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface DimRow {
  key: string
  count: number
  avgReach: number
  totalReach: number
  bestPieceId?: string
  bestPieceTitle?: string
  bestPieceReach?: number
}

interface Winner {
  id: string
  title: string
  channel: string
  funnelStage: string
  method?: string
  hook?: string
  reach: number
  saves: number
  shares: number
  comments: number
  dms: number
  linkClicks: number
}

interface Insights {
  totalWithMetric: number
  totalReach: number
  byChannel: DimRow[]
  byFunnel: DimRow[]
  byMethod: DimRow[]
  winners: Winner[]
}

const CHANNEL_LABEL: Record<string, string> = {
  WA_STATUS: 'WA Status',
  IG_STORY: 'IG Story',
  IG_POST: 'IG Post',
  IG_CAROUSEL: 'IG Carousel',
  IG_REELS: 'IG Reels',
  TIKTOK: 'TikTok',
}

const FUNNEL_LABEL: Record<string, string> = {
  TOFU: 'Awareness',
  MOFU: 'Pertimbangan',
  BOFU: 'Beli',
}

const METHOD_LABEL: Record<string, string> = {
  HOOK: 'Hook Framework',
  PAIN: 'Pain Point',
  PERSONA: 'Persona POV',
  TRENDS: 'Trending Search',
  WINNER: 'Belajar dari Viral',
  UNKNOWN: 'Tanpa metode',
}

export function InsightsTab() {
  const [data, setData] = useState<Insights | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/content/insights', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        if (j.success) setData(j.data.insights)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="text-warm-500 flex items-center gap-2 py-8 text-sm">
        <Loader2 className="size-4 animate-spin" /> Memuat…
      </div>
    )
  }

  if (!data || data.totalWithMetric === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={BarChart3}
            title="Belum ada data performa"
            description="Setelah kamu post konten, masuk ke detail konten itu, isi metric (reach, saves, DM, dst.). Hulao akan analisa pola konten yg berhasil dan rekomendasiin ide serupa di masa depan."
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <div className="text-warm-500 text-xs font-semibold tracking-wide uppercase">
              Konten dgn metric
            </div>
            <div className="font-display text-warm-900 text-2xl font-bold">
              {data.totalWithMetric.toLocaleString('id-ID')}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-warm-500 text-xs font-semibold tracking-wide uppercase">
              Total Reach
            </div>
            <div className="font-display text-primary-700 text-2xl font-bold">
              {data.totalReach.toLocaleString('id-ID')}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top 3 winners */}
      {data.winners.length > 0 && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-warm-900 flex items-center gap-1.5 text-sm font-semibold">
              <Trophy className="text-primary-500 size-4" />
              Top {data.winners.length} konten reach tertinggi
            </h3>
            <div className="space-y-2">
              {data.winners.map((w, i) => (
                <Link
                  key={w.id}
                  href={`/content/pieces/${w.id}`}
                  className="border-warm-200 bg-warm-50 hover:bg-warm-100 block rounded-md border p-3 transition-colors"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Crown
                        className={`size-3.5 ${i === 0 ? 'text-primary-500' : i === 1 ? 'text-warm-400' : 'text-primary-300'}`}
                      />
                      <span className="text-warm-500 text-xs font-semibold uppercase">
                        #{i + 1}
                      </span>
                      <Badge className="bg-warm-100 text-warm-700 text-xs">
                        {CHANNEL_LABEL[w.channel] ?? w.channel}
                      </Badge>
                      {w.method && (
                        <Badge className="bg-primary-100 text-primary-700 text-xs">
                          {METHOD_LABEL[w.method] ?? w.method}
                        </Badge>
                      )}
                    </div>
                    <strong className="font-display text-primary-700 text-sm tabular-nums">
                      {w.reach.toLocaleString('id-ID')} reach
                    </strong>
                  </div>
                  <p className="text-warm-900 mb-1 truncate text-sm font-medium">
                    {w.title}
                  </p>
                  <div className="text-warm-500 flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <Bookmark className="size-3" aria-hidden />
                      {w.saves}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Share2 className="size-3" aria-hidden />
                      {w.shares}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="size-3" aria-hidden />
                      {w.comments}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Send className="size-3" aria-hidden />
                      {w.dms}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Link2 className="size-3" aria-hidden />
                      {w.linkClicks}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* By channel / funnel / method */}
      <div className="grid gap-3 lg:grid-cols-3">
        <DimensionCard
          title="Per Channel"
          icon={<Sparkles className="text-primary-500 size-4" />}
          rows={data.byChannel}
          labelMap={CHANNEL_LABEL}
        />
        <DimensionCard
          title="Per Funnel"
          icon={<Sparkles className="text-primary-500 size-4" />}
          rows={data.byFunnel}
          labelMap={FUNNEL_LABEL}
        />
        <DimensionCard
          title="Per Metode"
          icon={<Sparkles className="text-primary-500 size-4" />}
          rows={data.byMethod}
          labelMap={METHOD_LABEL}
        />
      </div>

      {/* Hint to use winner method */}
      {data.winners.length >= 3 && (
        <Card className="bg-primary-50">
          <CardContent className="space-y-2 p-4">
            <h3 className="text-primary-900 flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="size-4" />
              Tip: pakai pola yg berhasil
            </h3>
            <p className="text-primary-800 text-xs">
              Hulao deteksi pola dari konten yg reach paling tinggi. Saat
              generate ide baru, centang &quot;Belajar dari konten viral&quot;
              supaya AI tahu apa yg works untuk audience kamu.
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href="/content?tab=generate">Buka Generate Ide →</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function DimensionCard({
  title,
  icon,
  rows,
  labelMap,
}: {
  title: string
  icon: React.ReactNode
  rows: DimRow[]
  labelMap: Record<string, string>
}) {
  if (rows.length === 0) return null
  const top = rows[0]!
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <h3 className="text-warm-900 flex items-center gap-1.5 text-sm font-semibold">
          {icon}
          {title}
        </h3>
        <div className="bg-primary-50 rounded-md p-2 text-xs">
          <div className="text-primary-700 text-xs font-semibold uppercase">
            Pemenang
          </div>
          <div className="font-display text-primary-900 text-base font-semibold">
            {labelMap[top.key] ?? top.key}
          </div>
          <div className="text-primary-700 text-xs">
            Avg {top.avgReach.toLocaleString('id-ID')} reach · {top.count}{' '}
            konten
          </div>
        </div>
        <div className="space-y-1">
          {rows.slice(1).map((r) => (
            <div
              key={r.key}
              className="flex items-center justify-between text-xs"
            >
              <span className="text-warm-700">{labelMap[r.key] ?? r.key}</span>
              <span className="text-warm-500 tabular-nums">
                {r.avgReach.toLocaleString('id-ID')} avg · {r.count}×
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
