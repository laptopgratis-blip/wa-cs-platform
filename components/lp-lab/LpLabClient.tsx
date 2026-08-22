'use client'

// LP Lab Dashboard Client — orchestrator state + render KPI/charts/tabs.
// Phase 2: Analytics. Phase 3-5 (heatmap, signals, AI optimize, score)
// akan tambah tab/section di sini.
import {
  ArrowLeft,
  BarChart3,
  Eye,
  Loader2,
  MousePointer,
  Sparkles,
  Timer,
  TrendingDown,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/shared/EmptyState'
import { PageContainer } from '@/components/shared/PageContainer'
import { PageHeader } from '@/components/shared/PageHeader'
import { CardGridSkeleton } from '@/components/shared/skeletons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

import { BreakdownList } from './BreakdownList'
import { FunnelChart } from './FunnelChart'
import { HeatmapView } from './HeatmapView'
import { OptimizationsHistoryDialog } from './OptimizationsHistoryDialog'
import { OptimizeFlow } from './OptimizeFlow'
import { ScoreGauge } from './ScoreGauge'
import { ScoreHistoryChart } from './ScoreHistoryChart'
import { SignalsView } from './SignalsView'
import { TimeOfDayHeatmap } from './TimeOfDayHeatmap'
import { VersionsDialog } from './VersionsDialog'

interface Lp {
  id: string
  title: string
  slug: string
  isPublished: boolean
}

interface AnalyticsData {
  lp: Lp
  range: { from: string; to: string }
  kpi: {
    visits: number
    uniqueVisitors: number
    ctaClickedCount: number
    ctaRate: number
    bouncedCount: number
    bounceRate: number
    avgTimeSec: number
    ctaClickEvents: number
    formSubmits: number
  }
  funnel: Array<{ step: string; count: number }>
  sources: Array<{ key: string; count: number }>
  mediums: Array<{ key: string; count: number }>
  campaigns: Array<{ key: string; count: number }>
  referrers: Array<{ key: string; count: number }>
  devices: Array<{ key: string; count: number }>
  browsers: Array<{ key: string; count: number }>
  oses: Array<{ key: string; count: number }>
  countries: Array<{ key: string; count: number }>
  ctas: Array<{ label: string; count: number }>
  timeOfDay: Array<{ dow: number; hour: number; count: number }>
}

type Period = '24h' | '7d' | '30d' | '90d'

function periodToRange(p: Period): { from: Date; to: Date } {
  const now = new Date()
  const ms: Record<Period, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
  }
  return { from: new Date(now.getTime() - ms[p]), to: now }
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('id-ID').format(Math.round(n))
}

function formatPct(n: number): string {
  return n.toFixed(1) + '%'
}

function formatDuration(sec: number): string {
  const s = Math.round(sec)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}m ${r}s`
}

interface Props {
  lp: Lp
  tier: 'FREE' | 'STARTER' | 'POPULAR' | 'POWER'
}

export function LpLabClient({ lp, tier }: Props) {
  const [period, setPeriod] = useState<Period>('7d')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  // Trigger score gauge refetch saat apply optimization atau restore version.
  const [scoreRefreshKey, setScoreRefreshKey] = useState(0)

  const isPower = tier === 'POWER'

  const load = useCallback(async () => {
    if (!isPower) return
    setRefreshing(true)
    try {
      const { from, to } = periodToRange(period)
      const url = `/api/lp/${encodeURIComponent(lp.id)}/analytics?from=${from.toISOString()}&to=${to.toISOString()}`
      const res = await fetch(url, { cache: 'no-store' })
      const json = await res.json()
      if (!json.success) {
        toast.error(json.error ?? 'Gagal load analytics')
        return
      }
      setData(json.data as AnalyticsData)
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [isPower, lp.id, period])

  useEffect(() => {
    void load()
  }, [load])

  if (!isPower) {
    return (
      <PageContainer width="narrow">
        <Card className="bg-primary-50">
          <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="bg-primary-100 text-primary-700 flex size-14 items-center justify-center rounded-full">
              <Sparkles className="size-7" />
            </div>
            <h2 className="font-display text-warm-900 text-xl font-semibold">
              LP Lab Eksklusif Paket POWER
            </h2>
            <p className="text-warm-700 max-w-md text-sm">
              Analytics traffic, heatmap, signal customer dari chat, dan
              optimasi AI berdasarkan data — semua tools digital marketing pro
              ada di sini. Upgrade ke POWER untuk unlock.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href="/landing-pages">
                  <ArrowLeft className="mr-1 size-4" /> Kembali
                </Link>
              </Button>
              <Button asChild>
                <Link href="/pricing">Upgrade ke POWER</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </PageContainer>
    )
  }

  return (
    <PageContainer width="wide">
      <div>
        <Link
          href={`/landing-pages/${lp.id}/edit`}
          className="text-warm-500 hover:text-warm-700 mb-1 inline-flex items-center gap-1 text-xs"
        >
          <ArrowLeft className="size-3.5" /> Kembali ke editor
        </Link>
        <PageHeader
          title="LP Lab"
          description={
            <span className="flex min-w-0 items-center">
              <span className="truncate">{lp.title}</span>
              {!lp.isPublished && (
                <Badge variant="outline" className="ml-2 shrink-0">
                  Draft
                </Badge>
              )}
            </span>
          }
          actions={
            <>
              <PeriodSelector value={period} onChange={setPeriod} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => void load()}
                disabled={refreshing}
              >
                {refreshing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  'Refresh'
                )}
              </Button>
              <OptimizationsHistoryDialog
                lpId={lp.id}
                onApplied={() => {
                  void load()
                  setScoreRefreshKey((k) => k + 1)
                }}
              />
              <VersionsDialog
                lpId={lp.id}
                onRestored={() => {
                  void load()
                  setScoreRefreshKey((k) => k + 1)
                }}
              />
              <OptimizeFlow
                lpId={lp.id}
                lpSlug={lp.slug}
                onApplied={() => {
                  void load()
                  setScoreRefreshKey((k) => k + 1)
                }}
              />
            </>
          }
        />
      </div>

      {loading && <CardGridSkeleton count={4} />}

      {!loading && data && data.kpi.visits === 0 && <AnalyticsEmpty lp={lp} />}

      {!loading && data && data.kpi.visits > 0 && (
        <>
          <ScoreGauge lpId={lp.id} refreshKey={scoreRefreshKey} />
          <KpiCards data={data} />
          <FunnelCard data={data} />
          <TabsSection data={data} lp={lp} scoreRefreshKey={scoreRefreshKey} />
        </>
      )}
    </PageContainer>
  )
}

// ─────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────

function PeriodSelector({
  value,
  onChange,
}: {
  value: Period
  onChange: (p: Period) => void
}) {
  const options: Period[] = ['24h', '7d', '30d', '90d']
  return (
    <div className="border-warm-300 bg-card flex items-center gap-0.5 rounded-md border p-0.5">
      {options.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`rounded px-2.5 py-1 text-xs font-medium transition ${
            value === p
              ? 'bg-primary-500 text-white'
              : 'text-warm-600 hover:bg-warm-100'
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  )
}

function AnalyticsEmpty({ lp }: { lp: Lp }) {
  return (
    <EmptyState
      bordered
      icon={BarChart3}
      title="Belum ada data tracking"
      description={
        <>
          Tracker JS sudah aktif — data akan masuk otomatis saat ada visitor.
          {!lp.isPublished && (
            <>
              {' '}
              <strong>LP belum dipublish</strong> — publish dulu di editor
              supaya bisa diakses publik dan track traffic.
            </>
          )}
        </>
      }
      action={
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/landing-pages/${lp.id}/edit`}>Buka Editor</Link>
          </Button>
          {lp.isPublished && (
            <Button asChild>
              <Link href={`/p/${lp.slug}`} target="_blank" rel="noreferrer">
                Lihat LP Live
              </Link>
            </Button>
          )}
        </div>
      }
    />
  )
}

function KpiCards({ data }: { data: AnalyticsData }) {
  const k = data.kpi
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <KpiCard
        icon={<Eye className="size-5" />}
        accent="primary"
        label="Pengunjung"
        value={formatNumber(k.visits)}
        sub={`${formatNumber(k.uniqueVisitors)} unik`}
      />
      <KpiCard
        icon={<MousePointer className="size-5" />}
        accent="primary"
        label="CTA Click Rate"
        value={formatPct(k.ctaRate)}
        sub={`${formatNumber(k.ctaClickedCount)} visit klik`}
      />
      <KpiCard
        icon={<Sparkles className="size-5" />}
        accent="primary"
        label="Total Klik CTA"
        value={formatNumber(k.ctaClickEvents)}
        sub={
          k.formSubmits > 0
            ? `${formatNumber(k.formSubmits)} submit form`
            : 'Belum ada submit'
        }
      />
      <KpiCard
        icon={<Timer className="size-5" />}
        accent="warm"
        label="Avg Time"
        value={formatDuration(k.avgTimeSec)}
        sub="per visit"
      />
      <KpiCard
        icon={<TrendingDown className="size-5" />}
        accent={k.bounceRate > 70 ? 'danger' : 'warm'}
        label="Bounce Rate"
        value={formatPct(k.bounceRate)}
        sub={`${formatNumber(k.bouncedCount)} bounce`}
      />
    </div>
  )
}

function KpiCard({
  icon,
  accent,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  accent: 'primary' | 'warm' | 'danger'
  label: string
  value: string
  sub: string
}) {
  const accentClass = {
    primary: 'bg-primary-50 text-primary-600',
    warm: 'bg-warm-100 text-warm-600',
    danger: cn(TONES.danger.bg, TONES.danger.text),
  }[accent]
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <div
          className={cn(
            'flex size-10 items-center justify-center rounded-lg',
            accentClass,
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-warm-500 text-xs">{label}</div>
          <div className="font-display text-warm-900 text-xl font-bold tabular-nums">
            {value}
          </div>
          <div className="text-warm-500 mt-0.5 truncate text-xs">{sub}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function FunnelCard({ data }: { data: AnalyticsData }) {
  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="font-display text-warm-900 text-sm font-semibold">
            Funnel Konversi
          </h3>
          <p className="text-warm-500 text-xs">
            Dari pengunjung sampai submit form
          </p>
        </div>
        <FunnelChart steps={data.funnel} />
      </CardContent>
    </Card>
  )
}

function TabsSection({
  data,
  lp,
  scoreRefreshKey,
}: {
  data: AnalyticsData
  lp: Lp
  scoreRefreshKey: number
}) {
  return (
    <Tabs defaultValue="ctas" className="w-full">
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="ctas">Top CTA</TabsTrigger>
        <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
        <TabsTrigger value="signals">Customer Signals</TabsTrigger>
        <TabsTrigger value="trend">Score Trend</TabsTrigger>
        <TabsTrigger value="sources">Sources</TabsTrigger>
        <TabsTrigger value="devices">Devices</TabsTrigger>
        <TabsTrigger value="time">Waktu Aktif</TabsTrigger>
        <TabsTrigger value="geo">Geografi</TabsTrigger>
      </TabsList>

      <TabsContent value="ctas" className="mt-3">
        <Card>
          <CardContent>
            <h3 className="font-display mb-2 text-sm font-semibold">
              Top Tombol CTA yang Diklik
            </h3>
            {data.ctas.length === 0 ? (
              <EmptyTab message="Belum ada CTA yang diklik. Pastikan tombol CTA pakai tag <a> ke wa.me, anchor #order, atau atribut data-lp-cta." />
            ) : (
              <BreakdownList
                items={data.ctas.map((c) => ({
                  key: c.label,
                  count: c.count,
                }))}
              />
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="heatmap" className="mt-3">
        <Card>
          <CardContent>
            <div className="mb-3">
              <h3 className="font-display text-sm font-semibold">
                Click Heatmap
              </h3>
              <p className="text-warm-500 text-xs">
                Posisi klik visitor di LP — merah = banyak klik, kosong = tidak
                ada interaksi. Filter per device karena layout berbeda.
              </p>
            </div>
            <HeatmapView lpId={lp.id} slug={lp.slug} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="signals" className="mt-3">
        <SignalsView lpId={lp.id} />
      </TabsContent>

      <TabsContent value="trend" className="mt-3">
        <ScoreHistoryChart lpId={lp.id} key={scoreRefreshKey} />
      </TabsContent>

      <TabsContent value="sources" className="mt-3 space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <SectionCard title="UTM Source">
            {data.sources.length === 0 ? (
              <EmptyTab message="Belum ada visit dengan ?utm_source. Tambahkan UTM saat share link untuk track campaign." />
            ) : (
              <BreakdownList items={data.sources} />
            )}
          </SectionCard>
          <SectionCard title="UTM Medium">
            {data.mediums.length === 0 ? (
              <EmptyTab message="Belum ada visit dengan ?utm_medium." />
            ) : (
              <BreakdownList items={data.mediums} />
            )}
          </SectionCard>
          <SectionCard title="UTM Campaign">
            {data.campaigns.length === 0 ? (
              <EmptyTab message="Belum ada visit dengan ?utm_campaign." />
            ) : (
              <BreakdownList items={data.campaigns} />
            )}
          </SectionCard>
          <SectionCard title="Referrer Host">
            {data.referrers.length === 0 ? (
              <EmptyTab message="Mostly direct visit (tidak ada referer header)." />
            ) : (
              <BreakdownList items={data.referrers} />
            )}
          </SectionCard>
        </div>
      </TabsContent>

      <TabsContent value="devices" className="mt-3 space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          <SectionCard title="Device Type">
            <BreakdownList items={data.devices} />
          </SectionCard>
          <SectionCard title="Browser">
            <BreakdownList items={data.browsers} />
          </SectionCard>
          <SectionCard title="Operating System">
            <BreakdownList items={data.oses} />
          </SectionCard>
        </div>
      </TabsContent>

      <TabsContent value="time" className="mt-3">
        <Card>
          <CardContent>
            <h3 className="font-display mb-2 text-sm font-semibold">
              Kapan Visitor Datang (jam WIB)
            </h3>
            <TimeOfDayHeatmap cells={data.timeOfDay} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="geo" className="mt-3">
        <Card>
          <CardContent>
            <h3 className="font-display mb-2 text-sm font-semibold">Country</h3>
            {data.countries.length === 0 ? (
              <EmptyTab message="Geoip belum tersedia (server tidak set country header). Phase berikutnya akan integrate ip-api untuk data geografi." />
            ) : (
              <BreakdownList items={data.countries} />
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}

function SectionCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardContent>
        <h4 className="font-display text-warm-900 mb-2 text-sm font-semibold">
          {title}
        </h4>
        {children}
      </CardContent>
    </Card>
  )
}

function EmptyTab({ message }: { message: string }) {
  return (
    <p className="border-warm-200 bg-warm-50 text-warm-500 rounded-md border border-dashed px-3 py-4 text-center text-xs">
      {message}
    </p>
  )
}
