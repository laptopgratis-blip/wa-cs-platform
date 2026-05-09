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

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'

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
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-amber-200 text-amber-900">
              <Sparkles className="size-7" />
            </div>
            <h2 className="font-display text-2xl font-bold text-amber-900">
              LP Lab Eksklusif Paket POWER
            </h2>
            <p className="max-w-md text-sm text-amber-800">
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
              <Button
                asChild
                className="bg-amber-600 text-white hover:bg-amber-700"
              >
                <Link href="/landing-pages/upgrade">
                  Upgrade ke POWER
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link
            href={`/landing-pages/${lp.id}/edit`}
            className="inline-flex items-center gap-1 text-xs text-warm-500 hover:text-warm-700"
          >
            <ArrowLeft className="size-3.5" /> Kembali ke editor
          </Link>
          <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
            LP Lab
          </h1>
          <p className="mt-0.5 truncate text-sm text-warm-500">
            {lp.title}
            {!lp.isPublished && (
              <Badge variant="outline" className="ml-2">
                Draft
              </Badge>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-warm-500">
          <Loader2 className="mr-2 size-5 animate-spin" /> Memuat data…
        </div>
      )}

      {!loading && data && data.kpi.visits === 0 && (
        <EmptyState lp={lp} />
      )}

      {!loading && data && data.kpi.visits > 0 && (
        <>
          <ScoreGauge lpId={lp.id} refreshKey={scoreRefreshKey} />
          <KpiCards data={data} />
          <FunnelCard data={data} />
          <TabsSection data={data} lp={lp} scoreRefreshKey={scoreRefreshKey} />
        </>
      )}
    </div>
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
    <div className="flex items-center gap-0.5 rounded-md border border-warm-300 bg-white p-0.5 dark:bg-warm-900">
      {options.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`rounded px-2.5 py-1 text-xs font-medium transition ${
            value === p
              ? 'bg-primary-500 text-white'
              : 'text-warm-600 hover:bg-warm-100 dark:hover:bg-warm-800'
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  )
}

function EmptyState({ lp }: { lp: Lp }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <BarChart3 className="size-10 text-warm-400" />
        <p className="font-medium text-warm-700">Belum ada data tracking</p>
        <p className="max-w-md text-sm text-warm-500">
          Tracker JS sudah aktif — data akan masuk otomatis saat ada visitor.
          {!lp.isPublished && (
            <>
              {' '}
              <strong>LP belum dipublish</strong> — publish dulu di editor
              supaya bisa diakses publik dan track traffic.
            </>
          )}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/landing-pages/${lp.id}/edit`}>Buka Editor</Link>
          </Button>
          {lp.isPublished && (
            <Button asChild>
              <Link
                href={`/p/${lp.slug}`}
                target="_blank"
                rel="noreferrer"
              >
                Lihat LP Live
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
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
        accent="emerald"
        label="CTA Click Rate"
        value={formatPct(k.ctaRate)}
        sub={`${formatNumber(k.ctaClickedCount)} visit klik`}
      />
      <KpiCard
        icon={<Sparkles className="size-5" />}
        accent="purple"
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
        accent={k.bounceRate > 70 ? 'rose' : 'warm'}
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
  accent: 'primary' | 'emerald' | 'purple' | 'warm' | 'rose'
  label: string
  value: string
  sub: string
}) {
  const accentClass = {
    primary: 'bg-primary-50 text-primary-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    purple: 'bg-purple-50 text-purple-600',
    warm: 'bg-warm-100 text-warm-600',
    rose: 'bg-rose-50 text-rose-600',
  }[accent]
  return (
    <Card className="rounded-xl border-warm-200">
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={`flex size-10 items-center justify-center rounded-lg ${accentClass}`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-xs text-warm-500">{label}</div>
          <div className="font-display text-xl font-bold tabular-nums text-warm-900 dark:text-warm-50">
            {value}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-warm-500">
            {sub}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function FunnelCard({ data }: { data: AnalyticsData }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="font-display text-sm font-semibold text-warm-900 dark:text-warm-50">
            Funnel Konversi
          </h3>
          <p className="text-xs text-warm-500">
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
          <CardContent className="p-4">
            <h3 className="mb-2 font-display text-sm font-semibold">
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
          <CardContent className="p-4">
            <div className="mb-3">
              <h3 className="font-display text-sm font-semibold">
                Click Heatmap
              </h3>
              <p className="text-xs text-warm-500">
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
          <CardContent className="p-4">
            <h3 className="mb-2 font-display text-sm font-semibold">
              Kapan Visitor Datang (jam WIB)
            </h3>
            <TimeOfDayHeatmap cells={data.timeOfDay} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="geo" className="mt-3">
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-2 font-display text-sm font-semibold">
              Country
            </h3>
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
      <CardContent className="p-4">
        <h4 className="mb-2 font-display text-sm font-semibold text-warm-900 dark:text-warm-50">
          {title}
        </h4>
        {children}
      </CardContent>
    </Card>
  )
}

function EmptyTab({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-dashed border-warm-200 bg-warm-50 px-3 py-4 text-center text-xs text-warm-500">
      {message}
    </p>
  )
}
