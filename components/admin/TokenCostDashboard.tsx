'use client'

// Admin: pemantauan biaya AI (token yang KITA bayar ke provider) + log
// penggunaan per user. Sumber tunggal: AiGenerationLog. Lihat
// /api/admin/token-cost/{summary,by-user,user-log}.
import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { PageHeader } from '@/components/shared/PageHeader'
import { CardGridSkeleton } from '@/components/shared/skeletons'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatNumber, formatRupiah } from '@/lib/format'
import { TONES } from '@/lib/ui-tones'

type Preset = 'TODAY' | '7D' | '30D'

const PROVIDER_COLORS: Record<string, string> = {
  ANTHROPIC: 'var(--chart-1)',
  OPENAI: 'var(--chart-2)',
  GOOGLE: 'var(--chart-3)',
  KLING: 'var(--chart-4)',
  FAL: 'var(--chart-5)',
  ELEVENLABS: 'var(--chart-2)',
  OTHER: 'var(--chart-5)',
}
function providerColor(p: string): string {
  return PROVIDER_COLORS[p] ?? 'var(--chart-5)'
}

interface Totals {
  calls: number
  apiCostUsd: number
  apiCostRp: number
  tokensCharged: number
  revenueRp: number
  profitRp: number
}
interface ProviderRow {
  provider: string
  calls: number
  apiCostUsd: number
  apiCostRp: number
  tokensCharged: number
  revenueRp: number
  profitRp: number
}
interface FeatureRow {
  featureKey: string
  modelName: string
  provider: string
  calls: number
  apiCostRp: number
  revenueRp: number
  profitRp: number
}
interface TimelineRow {
  day: string
  provider: string
  apiCostRp: number
}
interface KlingUsageRow {
  featureKey: string
  modelName: string
  calls: number
  seconds: number
  apiCostUsd: number
  apiCostRp: number
}
interface KlingJobRow {
  status: string
  jobs: number
  seconds: number
  retries: number
}
interface KlingClipRow {
  status: string
  clips: number
}
interface Summary {
  totals: Totals
  byProvider: ProviderRow[]
  byFeature: FeatureRow[]
  timeline: TimelineRow[]
  kling?: {
    usage: KlingUsageRow[]
    jobs: KlingJobRow[]
    clips: KlingClipRow[]
  }
}

// Konversi USD → kredit Kling. Basis: top-up 1000 kredit = $140
// (platform.klingai.com) → $0.14/kredit. Estimasi — akurasinya mengikuti
// harga USD per model yang admin isi di /admin/ai-pricing.
const KLING_USD_PER_CREDIT = 0.14
interface UserRow {
  userId: string
  email: string | null
  name: string | null
  calls: number
  tokensCharged: number
  apiCostRp: number
  revenueRp: number
  profitRp: number
}

function rangeOf(preset: Preset): { from: string; to: string } {
  const now = new Date()
  const start = new Date(now)
  if (preset === 'TODAY') start.setHours(0, 0, 0, 0)
  else if (preset === '7D') start.setDate(start.getDate() - 7)
  else start.setDate(start.getDate() - 30)
  return { from: start.toISOString(), to: now.toISOString() }
}

export function TokenCostDashboard() {
  const [preset, setPreset] = useState<Preset>('7D')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [drillUserId, setDrillUserId] = useState<string | null>(null)

  const range = useMemo(() => rangeOf(preset), [preset])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = `from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`
      const [sRes, uRes] = await Promise.all([
        fetch(`/api/admin/token-cost/summary?${qs}`, { cache: 'no-store' }),
        fetch(`/api/admin/token-cost/by-user?${qs}`, { cache: 'no-store' }),
      ])
      const sJson = await sRes.json()
      const uJson = await uRes.json()
      if (sJson.success) setSummary(sJson.data)
      if (uJson.success) setUsers(uJson.data)
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => {
    void load()
  }, [load])

  // Pivot timeline → [{day, ANTHROPIC, OPENAI, ...}] untuk stacked bar.
  const { chartData, chartProviders } = useMemo(() => {
    const rows = summary?.timeline ?? []
    const provSet = new Set<string>()
    const byDay = new Map<string, Record<string, number | string>>()
    for (const r of rows) {
      provSet.add(r.provider)
      const d: Record<string, number | string> = byDay.get(r.day) ?? {
        day: r.day,
      }
      d[r.provider] = Math.round(r.apiCostRp)
      byDay.set(r.day, d)
    }
    return {
      chartData: Array.from(byDay.values()),
      chartProviders: Array.from(provSet),
    }
  }, [summary])

  const t = summary?.totals

  return (
    <div className="space-y-5">
      <PageHeader
        title="Token & Biaya AI"
        description="Biaya yang kita bayar ke tiap provider + log penggunaan per user. Sumber: AiGenerationLog (semua fitur, termasuk CS WA)."
        actions={
          <div className="flex gap-1.5">
            {(['TODAY', '7D', '30D'] as Preset[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPreset(p)}
                className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  preset === p
                    ? 'bg-primary-500 text-warm-900'
                    : 'bg-warm-100 text-warm-700 hover:bg-warm-200'
                }`}
              >
                {p === 'TODAY' ? 'Hari ini' : p === '7D' ? '7 hari' : '30 hari'}
              </button>
            ))}
          </div>
        }
      />

      {loading ? (
        <CardGridSkeleton count={4} />
      ) : !summary ? (
        <p className="text-muted-foreground text-sm">Gagal memuat data.</p>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Biaya Provider (Rp)"
              value={formatRupiah(t!.apiCostRp)}
              sub={`$${t!.apiCostUsd.toFixed(2)} • ${formatNumber(t!.calls)} panggilan`}
              accent={TONES.danger.text}
            />
            <StatCard
              label="Token Di-charge"
              value={formatNumber(t!.tokensCharged)}
              sub="ke saldo user"
            />
            <StatCard
              label="Pendapatan (Rp)"
              value={formatRupiah(t!.revenueRp)}
              sub="dari token user"
              accent={TONES.success.text}
            />
            <StatCard
              label="Profit (Rp)"
              value={formatRupiah(t!.profitRp)}
              sub={`margin ${t!.revenueRp > 0 ? Math.round((t!.profitRp / t!.revenueRp) * 100) : 0}%`}
              accent={t!.profitRp >= 0 ? TONES.success.text : TONES.danger.text}
            />
          </div>

          {/* Per provider */}
          <Section title="Biaya per Provider">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-muted-foreground text-xs">
                    Provider
                  </TableHead>
                  <TableHead className="text-muted-foreground text-right text-xs">
                    Panggilan
                  </TableHead>
                  <TableHead className="text-muted-foreground text-right text-xs">
                    Biaya USD
                  </TableHead>
                  <TableHead className="text-muted-foreground text-right text-xs">
                    Biaya Rp
                  </TableHead>
                  <TableHead className="text-muted-foreground text-right text-xs">
                    % Biaya
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.byProvider.map((p) => (
                  <TableRow key={p.provider}>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block size-2.5 rounded-full"
                          style={{ background: providerColor(p.provider) }}
                        />
                        {p.provider}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(p.calls)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ${p.apiCostUsd.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRupiah(p.apiCostRp)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t!.apiCostRp > 0
                        ? Math.round((p.apiCostRp / t!.apiCostRp) * 100)
                        : 0}
                      %
                    </TableCell>
                  </TableRow>
                ))}
                {summary.byProvider.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-muted-foreground py-4 text-center"
                    >
                      Belum ada data.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </Section>

          {/* Timeline chart */}
          <Section title="Biaya Harian per Provider (Rp)">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-border"
                  />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    className="text-xs"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    className="text-xs"
                    width={64}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${Math.round(v / 1000)}rb` : String(v)
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--popover)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value) => formatRupiah(Number(value))}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {chartProviders.map((p) => (
                    <Bar
                      key={p}
                      dataKey={p}
                      stackId="cost"
                      fill={providerColor(p)}
                      radius={[2, 2, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>

          {/* Per feature */}
          <Section title="Biaya per Fitur / Model">
            <div className="max-h-72 overflow-y-auto">
              <Table>
                <TableHeader className="bg-card sticky top-0">
                  <TableRow>
                    <TableHead className="text-muted-foreground text-xs">
                      Fitur
                    </TableHead>
                    <TableHead className="text-muted-foreground text-xs">
                      Model
                    </TableHead>
                    <TableHead className="text-muted-foreground text-right text-xs">
                      Panggilan
                    </TableHead>
                    <TableHead className="text-muted-foreground text-right text-xs">
                      Biaya Rp
                    </TableHead>
                    <TableHead className="text-muted-foreground text-right text-xs">
                      Profit Rp
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.byFeature.map((f, i) => (
                    <TableRow key={`${f.featureKey}-${f.modelName}-${i}`}>
                      <TableCell className="font-medium">
                        {f.featureKey}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {f.modelName}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(f.calls)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRupiah(f.apiCostRp)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${f.profitRp >= 0 ? TONES.success.text : TONES.danger.text}`}
                      >
                        {formatRupiah(f.profitRp)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>

          {/* Detail Kling — kredit terpakai + penjelasan selisih panggilan */}
          {summary.kling && <KlingDetailSection kling={summary.kling} />}

          {/* Per user */}
          <Section title="Penggunaan per User (klik untuk log rinci)">
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="bg-card sticky top-0">
                  <TableRow>
                    <TableHead className="text-muted-foreground text-xs">
                      User
                    </TableHead>
                    <TableHead className="text-muted-foreground text-right text-xs">
                      Panggilan
                    </TableHead>
                    <TableHead className="text-muted-foreground text-right text-xs">
                      Token
                    </TableHead>
                    <TableHead className="text-muted-foreground text-right text-xs">
                      Biaya Rp
                    </TableHead>
                    <TableHead className="text-muted-foreground text-right text-xs">
                      Profit Rp
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow
                      key={u.userId}
                      onClick={() => setDrillUserId(u.userId)}
                      className="cursor-pointer"
                    >
                      <TableCell>
                        <div className="font-medium">{u.name ?? '—'}</div>
                        <div className="text-muted-foreground text-xs">
                          {u.email}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(u.calls)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(u.tokensCharged)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRupiah(u.apiCostRp)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${u.profitRp >= 0 ? TONES.success.text : TONES.danger.text}`}
                      >
                        {formatRupiah(u.profitRp)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-muted-foreground py-4 text-center"
                      >
                        Belum ada penggunaan.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </Section>
        </>
      )}

      {drillUserId ? (
        <UserLogModal
          userId={drillUserId}
          from={range.from}
          to={range.to}
          onClose={() => setDrillUserId(null)}
        />
      ) : null}
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: string
}) {
  return (
    <Card size="sm">
      <CardContent>
        <div className="text-muted-foreground text-xs">{label}</div>
        <div
          className={`mt-0.5 text-lg font-semibold tabular-nums ${accent ?? ''}`}
        >
          {value}
        </div>
        {sub ? (
          <div className="text-muted-foreground text-xs">{sub}</div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardContent>
        <h2 className="text-warm-900 mb-2 text-sm font-semibold">{title}</h2>
        {children}
      </CardContent>
    </Card>
  )
}

// Detail pemakaian Kling: kredit terpakai (dari USD) + selisih antara
// submit generate vs panggilan yang ter-charge (gagal/retry tidak ditagih).
function KlingDetailSection({
  kling,
}: {
  kling: NonNullable<Summary['kling']>
}) {
  const totalUsd = kling.usage.reduce((s, r) => s + r.apiCostUsd, 0)
  const totalCalls = kling.usage.reduce((s, r) => s + r.calls, 0)
  const totalSeconds = kling.usage.reduce((s, r) => s + r.seconds, 0)
  const totalCredits = totalUsd / KLING_USD_PER_CREDIT

  const jobsBy = (status: string) => kling.jobs.find((j) => j.status === status)
  const jobsDone = jobsBy('DONE')?.jobs ?? 0
  const jobsFailed = jobsBy('FAILED')?.jobs ?? 0
  const jobsRunning =
    (jobsBy('RUNNING')?.jobs ?? 0) + (jobsBy('QUEUED')?.jobs ?? 0)
  const totalRetries = kling.jobs.reduce((s, j) => s + j.retries, 0)

  const clipsBy = (status: string) =>
    kling.clips.find((c) => c.status === status)?.clips ?? 0
  const clipsReady = clipsBy('READY')
  const clipsFailed = clipsBy('FAILED')

  const hasActivity =
    totalCalls > 0 || kling.jobs.length > 0 || kling.clips.length > 0

  return (
    <Section title="Detail Kling — Kredit Terpakai">
      {!hasActivity ? (
        <p className="text-muted-foreground py-4 text-center text-sm">
          Tidak ada pemakaian Kling di rentang ini.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Est. Kredit Kling"
              value={totalCredits.toLocaleString('id-ID', {
                maximumFractionDigits: 1,
              })}
              sub={`asumsi $${KLING_USD_PER_CREDIT}/kredit (top-up $140 = 1.000)`}
              accent="text-primary-600"
            />
            <StatCard
              label="Biaya Kling (USD)"
              value={`$${totalUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
              sub="dari harga di /admin/ai-pricing"
            />
            <StatCard
              label="Video Ter-charge"
              value={formatNumber(totalCalls)}
              sub={`${formatNumber(totalSeconds)} detik total`}
            />
            <StatCard
              label="Sukses / Gagal / Retry"
              value={`${formatNumber(jobsDone + clipsReady)} / ${formatNumber(jobsFailed + clipsFailed)} / ${formatNumber(totalRetries)}`}
              sub={
                jobsRunning > 0
                  ? `${formatNumber(jobsRunning)} masih proses`
                  : 'host video + klip lipsync'
              }
            />
          </div>

          <div className="max-h-56 overflow-y-auto">
            <Table>
              <TableHeader className="bg-card sticky top-0">
                <TableRow>
                  <TableHead className="text-muted-foreground text-xs">
                    Fitur
                  </TableHead>
                  <TableHead className="text-muted-foreground text-xs">
                    Model
                  </TableHead>
                  <TableHead className="text-muted-foreground text-right text-xs">
                    Panggilan
                  </TableHead>
                  <TableHead className="text-muted-foreground text-right text-xs">
                    Detik
                  </TableHead>
                  <TableHead className="text-muted-foreground text-right text-xs">
                    USD
                  </TableHead>
                  <TableHead className="text-muted-foreground text-right text-xs">
                    Est. Kredit
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kling.usage.map((r, i) => (
                  <TableRow key={`${r.featureKey}-${r.modelName}-${i}`}>
                    <TableCell className="font-medium">
                      {r.featureKey}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {r.modelName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(r.calls)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(r.seconds)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      $
                      {r.apiCostUsd.toLocaleString('en-US', {
                        maximumFractionDigits: 2,
                      })}
                    </TableCell>
                    <TableCell className="text-primary-600 text-right font-medium tabular-nums">
                      {(r.apiCostUsd / KLING_USD_PER_CREDIT).toLocaleString(
                        'id-ID',
                        { maximumFractionDigits: 1 },
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {kling.usage.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-muted-foreground py-4 text-center"
                    >
                      Belum ada panggilan Kling yang ter-charge di rentang ini.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>

          <p className="bg-warm-50 text-warm-600 rounded-lg p-3 text-xs leading-relaxed">
            <strong>
              Kenapa jumlah panggilan bisa beda dengan jumlah klik generate?
            </strong>{' '}
            Tabel di atas hanya mencatat video yang <em>berhasil</em> dan
            ter-charge. Generate yang gagal (
            {formatNumber(jobsFailed + clipsFailed)} di rentang ini) dan
            auto-retry ({formatNumber(totalRetries)}×) tetap memakai antrian
            Kling tapi tidak ditagih ke user — kredit Kling untuk task gagal
            umumnya di-refund otomatis oleh Kling. Akurasi kredit mengikuti
            harga USD per model di /admin/ai-pricing.
          </p>
        </div>
      )}
    </Section>
  )
}

interface LogItem {
  id: string
  featureKey: string
  modelName: string
  provider: string | null
  inputTokens: number
  outputTokens: number
  tokensCharged: number
  apiCostRp: number
  revenueRp: number
  profitRp: number
  status: string
  createdAt: string
}

function UserLogModal({
  userId,
  from,
  to,
  onClose,
}: {
  userId: string
  from: string
  to: string
  onClose: () => void
}) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{
    user: { email: string | null; name: string | null } | null
    total: number
    totalPages: number
    items: LogItem[]
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const qs = `userId=${encodeURIComponent(userId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&page=${page}`
    fetch(`/api/admin/token-cost/user-log?${qs}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j.success) setData(j.data)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId, from, to, page])

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <div className="border-b px-4 py-3">
          <DialogTitle className="font-semibold">Log Penggunaan AI</DialogTitle>
          <DialogDescription className="text-xs">
            {data?.user?.name ?? '—'} · {data?.user?.email ?? userId} ·{' '}
            {data ? `${formatNumber(data.total)} panggilan` : '…'}
          </DialogDescription>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="text-warm-400 size-5 animate-spin" />
            </div>
          ) : (
            <Table className="text-xs">
              <TableHeader className="bg-card sticky top-0">
                <TableRow>
                  <TableHead className="text-muted-foreground text-xs">
                    Waktu
                  </TableHead>
                  <TableHead className="text-muted-foreground text-xs">
                    Fitur
                  </TableHead>
                  <TableHead className="text-muted-foreground text-xs">
                    Provider
                  </TableHead>
                  <TableHead className="text-muted-foreground text-right text-xs">
                    In/Out tok
                  </TableHead>
                  <TableHead className="text-muted-foreground text-right text-xs">
                    Charge
                  </TableHead>
                  <TableHead className="text-muted-foreground text-right text-xs">
                    Biaya Rp
                  </TableHead>
                  <TableHead className="text-muted-foreground text-xs">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.items ?? []).map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="whitespace-nowrap">
                      {new Date(it.createdAt).toLocaleString('id-ID')}
                    </TableCell>
                    <TableCell>
                      {it.featureKey}
                      <div className="text-muted-foreground text-xs">
                        {it.modelName}
                      </div>
                    </TableCell>
                    <TableCell>{it.provider ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {it.inputTokens}/{it.outputTokens}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(it.tokensCharged)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRupiah(it.apiCostRp)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          it.status === 'OK'
                            ? TONES.success.text
                            : TONES.warning.text
                        }
                      >
                        {it.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {(data?.items.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-muted-foreground py-6 text-center"
                    >
                      Tidak ada log di rentang ini.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          )}
        </div>
        {data && data.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t px-4 py-2 text-sm">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="hover:bg-warm-100 rounded-md px-3 py-1 disabled:opacity-40"
            >
              ← Sebelumnya
            </button>
            <span className="text-muted-foreground text-xs">
              Hal {page}/{data.totalPages}
            </span>
            <button
              type="button"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="hover:bg-warm-100 rounded-md px-3 py-1 disabled:opacity-40"
            >
              Berikutnya →
            </button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
