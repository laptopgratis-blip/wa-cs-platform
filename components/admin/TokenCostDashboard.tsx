'use client'

// Admin: pemantauan biaya AI (token yang KITA bayar ke provider) + log
// penggunaan per user. Sumber tunggal: AiGenerationLog. Lihat
// /api/admin/token-cost/{summary,by-user,user-log}.
import { Loader2, X } from 'lucide-react'
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

import { formatNumber, formatRupiah } from '@/lib/format'

type Preset = 'TODAY' | '7D' | '30D'

const PROVIDER_COLORS: Record<string, string> = {
  ANTHROPIC: '#f97316',
  OPENAI: '#10b981',
  GOOGLE: '#3b82f6',
  KLING: '#a855f7',
  FAL: '#ec4899',
  ELEVENLABS: '#eab308',
  OTHER: '#94a3b8',
}
function providerColor(p: string): string {
  return PROVIDER_COLORS[p] ?? '#94a3b8'
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
interface Summary {
  totals: Totals
  byProvider: ProviderRow[]
  byFeature: FeatureRow[]
  timeline: TimelineRow[]
}
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
      const d: Record<string, number | string> = byDay.get(r.day) ?? { day: r.day }
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Token &amp; Biaya AI</h1>
          <p className="text-sm text-muted-foreground">
            Biaya yang kita bayar ke tiap provider + log penggunaan per user.
            Sumber: AiGenerationLog (semua fitur, termasuk CS WA).
          </p>
        </div>
        <div className="flex gap-1.5">
          {(['TODAY', '7D', '30D'] as Preset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                preset === p
                  ? 'bg-orange-500 text-white'
                  : 'bg-warm-100 text-warm-700 hover:bg-warm-200'
              }`}
            >
              {p === 'TODAY' ? 'Hari ini' : p === '7D' ? '7 hari' : '30 hari'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-warm-400" />
        </div>
      ) : !summary ? (
        <p className="text-sm text-muted-foreground">Gagal memuat data.</p>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Biaya Provider (Rp)"
              value={formatRupiah(t!.apiCostRp)}
              sub={`$${t!.apiCostUsd.toFixed(2)} • ${formatNumber(t!.calls)} panggilan`}
              accent="text-red-600"
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
              accent="text-emerald-600"
            />
            <StatCard
              label="Profit (Rp)"
              value={formatRupiah(t!.profitRp)}
              sub={`margin ${t!.revenueRp > 0 ? Math.round((t!.profitRp / t!.revenueRp) * 100) : 0}%`}
              accent={t!.profitRp >= 0 ? 'text-emerald-600' : 'text-red-600'}
            />
          </div>

          {/* Per provider */}
          <Section title="Biaya per Provider">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2">Provider</th>
                    <th className="py-2 text-right">Panggilan</th>
                    <th className="py-2 text-right">Biaya USD</th>
                    <th className="py-2 text-right">Biaya Rp</th>
                    <th className="py-2 text-right">% Biaya</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byProvider.map((p) => (
                    <tr key={p.provider} className="border-b last:border-0">
                      <td className="py-2">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ background: providerColor(p.provider) }}
                          />
                          {p.provider}
                        </span>
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatNumber(p.calls)}</td>
                      <td className="py-2 text-right tabular-nums">${p.apiCostUsd.toFixed(2)}</td>
                      <td className="py-2 text-right tabular-nums">{formatRupiah(p.apiCostRp)}</td>
                      <td className="py-2 text-right tabular-nums">
                        {t!.apiCostRp > 0 ? Math.round((p.apiCostRp / t!.apiCostRp) * 100) : 0}%
                      </td>
                    </tr>
                  ))}
                  {summary.byProvider.length === 0 ? (
                    <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">Belum ada data.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Section>

          {/* Timeline chart */}
          <Section title="Biaya Harian per Provider (Rp)">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} className="text-xs" />
                  <YAxis tickLine={false} axisLine={false} className="text-xs" width={64}
                    tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}rb` : String(v))} />
                  <Tooltip
                    contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                    formatter={(value) => formatRupiah(Number(value))}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {chartProviders.map((p) => (
                    <Bar key={p} dataKey={p} stackId="cost" fill={providerColor(p)} radius={[2, 2, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>

          {/* Per feature */}
          <Section title="Biaya per Fitur / Model">
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2">Fitur</th>
                    <th className="py-2">Model</th>
                    <th className="py-2 text-right">Panggilan</th>
                    <th className="py-2 text-right">Biaya Rp</th>
                    <th className="py-2 text-right">Profit Rp</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byFeature.map((f, i) => (
                    <tr key={`${f.featureKey}-${f.modelName}-${i}`} className="border-b last:border-0">
                      <td className="py-1.5 font-medium">{f.featureKey}</td>
                      <td className="py-1.5 text-xs text-muted-foreground">{f.modelName}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatNumber(f.calls)}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatRupiah(f.apiCostRp)}</td>
                      <td className={`py-1.5 text-right tabular-nums ${f.profitRp >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatRupiah(f.profitRp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* Per user */}
          <Section title="Penggunaan per User (klik untuk log rinci)">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2">User</th>
                    <th className="py-2 text-right">Panggilan</th>
                    <th className="py-2 text-right">Token</th>
                    <th className="py-2 text-right">Biaya Rp</th>
                    <th className="py-2 text-right">Profit Rp</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr
                      key={u.userId}
                      onClick={() => setDrillUserId(u.userId)}
                      className="cursor-pointer border-b last:border-0 hover:bg-warm-50"
                    >
                      <td className="py-2">
                        <div className="font-medium">{u.name ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatNumber(u.calls)}</td>
                      <td className="py-2 text-right tabular-nums">{formatNumber(u.tokensCharged)}</td>
                      <td className="py-2 text-right tabular-nums">{formatRupiah(u.apiCostRp)}</td>
                      <td className={`py-2 text-right tabular-nums ${u.profitRp >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatRupiah(u.profitRp)}</td>
                    </tr>
                  ))}
                  {users.length === 0 ? (
                    <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">Belum ada penggunaan.</td></tr>
                  ) : null}
                </tbody>
              </table>
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

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-lg font-bold tabular-nums ${accent ?? ''}`}>{value}</div>
      {sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold text-warm-800">{title}</h2>
      {children}
    </div>
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

function UserLogModal({ userId, from, to, onClose }: { userId: string; from: string; to: string; onClose: () => void }) {
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
      .then((j) => { if (!cancelled && j.success) setData(j.data) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [userId, from, to, page])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="font-semibold">Log Penggunaan AI</h3>
            <p className="text-xs text-muted-foreground">
              {data?.user?.name ?? '—'} · {data?.user?.email ?? userId} ·{' '}
              {data ? `${formatNumber(data.total)} panggilan` : '…'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-md p-1.5 hover:bg-warm-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-warm-400" /></div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1.5">Waktu</th>
                  <th className="py-1.5">Fitur</th>
                  <th className="py-1.5">Provider</th>
                  <th className="py-1.5 text-right">In/Out tok</th>
                  <th className="py-1.5 text-right">Charge</th>
                  <th className="py-1.5 text-right">Biaya Rp</th>
                  <th className="py-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {(data?.items ?? []).map((it) => (
                  <tr key={it.id} className="border-b last:border-0">
                    <td className="py-1.5 whitespace-nowrap">{new Date(it.createdAt).toLocaleString('id-ID')}</td>
                    <td className="py-1.5">{it.featureKey}<div className="text-[10px] text-muted-foreground">{it.modelName}</div></td>
                    <td className="py-1.5">{it.provider ?? '—'}</td>
                    <td className="py-1.5 text-right tabular-nums">{it.inputTokens}/{it.outputTokens}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatNumber(it.tokensCharged)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatRupiah(it.apiCostRp)}</td>
                    <td className="py-1.5">
                      <span className={it.status === 'OK' ? 'text-emerald-600' : 'text-amber-600'}>{it.status}</span>
                    </td>
                  </tr>
                ))}
                {(data?.items.length ?? 0) === 0 ? (
                  <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">Tidak ada log di rentang ini.</td></tr>
                ) : null}
              </tbody>
            </table>
          )}
        </div>
        {data && data.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t px-4 py-2 text-sm">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md px-3 py-1 hover:bg-warm-100 disabled:opacity-40">← Sebelumnya</button>
            <span className="text-xs text-muted-foreground">Hal {page}/{data.totalPages}</span>
            <button type="button" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-md px-3 py-1 hover:bg-warm-100 disabled:opacity-40">Berikutnya →</button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
