'use client'

// Dashboard profit — 4 section: summary, by-model, by-user, export CSV.
// Filter range: hari ini / 7 hari / 30 hari / custom.
import { Download, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatNumber, formatRupiah } from '@/lib/format'
import { cn } from '@/lib/utils'

interface SourceBreakdown {
  calls: number
  cost: number
  revenue: number
}

interface Summary {
  from: string
  to: string
  messages: number
  apiCostRp: number
  revenueRp: number
  profitRp: number
  marginPct: number
  status: 'AMAN' | 'TIPIS' | 'RUGI'
  bySource: {
    messageAi: SourceBreakdown
    aiGenerationLog: SourceBreakdown
    lpGeneration: SourceBreakdown
    lpOptimization: SourceBreakdown
    soulSimulation: SourceBreakdown
  }
  previous: { profitRp: number; deltaPct: number | null }
}

const SOURCE_LABEL: Record<keyof Summary['bySource'], string> = {
  messageAi: 'AI CS WA',
  aiGenerationLog: 'Content Studio',
  lpGeneration: 'LP Generate',
  lpOptimization: 'LP Optimize',
  soulSimulation: 'Soul Lab',
}

interface ByModel {
  modelId: string
  name: string
  provider: string
  messages: number
  apiCostRp: number
  revenueRp: number
  profitRp: number
  marginPct: number
  status: 'AMAN' | 'TIPIS' | 'RUGI'
}

interface ByUser {
  userId: string
  email: string
  name: string | null
  messages: number
  apiCostRp: number
  revenueRp: number
  profitRp: number
}

interface ByFeature {
  featureKey: string
  displayName: string
  modelName: string | null
  calls: number
  apiCostRp: number
  revenueRp: number
  profitRp: number
  marginPct: number
  status: 'AMAN' | 'TIPIS' | 'RUGI'
}

type Preset = 'TODAY' | '7D' | '30D' | 'CUSTOM'

function rangeOf(preset: Preset, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date()
  if (preset === 'TODAY') {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    return { from: start.toISOString(), to: now.toISOString() }
  }
  if (preset === '7D') {
    const start = new Date(now.getTime() - 7 * 24 * 3600 * 1000)
    return { from: start.toISOString(), to: now.toISOString() }
  }
  if (preset === '30D') {
    const start = new Date(now.getTime() - 30 * 24 * 3600 * 1000)
    return { from: start.toISOString(), to: now.toISOString() }
  }
  // CUSTOM
  return {
    from: customFrom ? new Date(customFrom).toISOString() : new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString(),
    to: customTo ? new Date(customTo).toISOString() : now.toISOString(),
  }
}

const STATUS_STYLE: Record<'AMAN' | 'TIPIS' | 'RUGI', string> = {
  AMAN: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
  TIPIS: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  RUGI: 'bg-red-100 text-red-700 hover:bg-red-100',
}

const STATUS_LABEL: Record<'AMAN' | 'TIPIS' | 'RUGI', string> = {
  AMAN: '🟢 SEHAT',
  TIPIS: '🟡 TIPIS',
  RUGI: '🔴 RUGI',
}

export function ProfitabilityDashboard() {
  const [preset, setPreset] = useState<Preset>('7D')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [byModel, setByModel] = useState<ByModel[]>([])
  const [byUser, setByUser] = useState<ByUser[]>([])
  const [byFeature, setByFeature] = useState<ByFeature[]>([])
  const [loading, setLoading] = useState(false)

  const range = useMemo(() => rangeOf(preset, customFrom, customTo), [
    preset,
    customFrom,
    customTo,
  ])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`
      const [s, m, u, f] = await Promise.all([
        fetch(`/api/admin/profitability/summary${qs}`).then((r) => r.json()),
        fetch(`/api/admin/profitability/by-model${qs}`).then((r) => r.json()),
        fetch(`/api/admin/profitability/by-user${qs}`).then((r) => r.json()),
        fetch(`/api/admin/profitability/by-feature${qs}`).then((r) => r.json()),
      ])
      if (s.success) setSummary(s.data)
      if (m.success) setByModel(m.data)
      if (u.success) setByUser(u.data)
      if (f.success) setByFeature(f.data)
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => {
    void load()
  }, [load])

  function exportCsv() {
    const qs = `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`
    const url = `/api/admin/profitability/export${qs}`
    // Pakai anchor agar browser handle download dengan filename dari header.
    const a = document.createElement('a')
    a.href = url
    a.download = ''
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    toast.success('Download dimulai')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
            Profitability
          </h1>
          <p className="mt-1 text-sm text-warm-500">
            Cost API real, pendapatan, profit & margin per pesan AI.
          </p>
        </div>
        <Button variant="outline" onClick={exportCsv}>
          <Download className="mr-2 size-4" />
          Export CSV
        </Button>
      </div>

      {/* Range filter */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-2 py-4">
          {(['TODAY', '7D', '30D', 'CUSTOM'] as Preset[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={preset === p ? 'default' : 'outline'}
              onClick={() => setPreset(p)}
            >
              {p === 'TODAY' && 'Hari Ini'}
              {p === '7D' && '7 Hari'}
              {p === '30D' && '30 Hari'}
              {p === 'CUSTOM' && 'Custom'}
            </Button>
          ))}
          {preset === 'CUSTOM' && (
            <div className="flex items-end gap-2">
              <div>
                <Label htmlFor="from" className="text-xs">
                  Dari
                </Label>
                <Input
                  id="from"
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="to" className="text-xs">
                  Sampai
                </Label>
                <Input
                  id="to"
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </div>
            </div>
          )}
          {loading && <Loader2 className="ml-auto size-4 animate-spin" />}
        </CardContent>
      </Card>

      {/* Section A — Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent>
          {summary ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Profit"
                value={formatRupiah(summary.profitRp)}
                hint={
                  summary.previous.deltaPct !== null
                    ? `${summary.previous.deltaPct >= 0 ? '↑' : '↓'} ${Math.abs(
                        summary.previous.deltaPct,
                      ).toFixed(1)}% vs periode sebelumnya`
                    : 'Belum ada data sebelumnya'
                }
                emphasis={summary.profitRp < 0 ? 'negative' : 'positive'}
              />
              <Stat
                label="Pesan AI"
                value={`${formatNumber(summary.messages)} pesan`}
                hint={
                  <Badge
                    variant="secondary"
                    className={cn(
                      'mt-1 font-normal',
                      STATUS_STYLE[summary.status],
                    )}
                  >
                    {STATUS_LABEL[summary.status]}
                  </Badge>
                }
              />
              <Stat label="Cost API" value={formatRupiah(summary.apiCostRp)} />
              <Stat
                label="Pendapatan"
                value={formatRupiah(summary.revenueRp)}
                hint={`Margin rata-rata: ${summary.marginPct.toFixed(1)}%`}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Memuat...</p>
          )}
          {summary && (
            <div className="mt-6">
              <div className="mb-2 text-sm font-medium">Breakdown per Sumber</div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sumber</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Cost API</TableHead>
                      <TableHead className="text-right">Pendapatan</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(Object.keys(summary.bySource) as Array<keyof Summary['bySource']>).map(
                      (k) => {
                        const row = summary.bySource[k]
                        const profit = row.revenue - row.cost
                        return (
                          <TableRow key={k}>
                            <TableCell>{SOURCE_LABEL[k]}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatNumber(row.calls)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatRupiah(row.cost)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatRupiah(row.revenue)}
                            </TableCell>
                            <TableCell
                              className={cn(
                                'text-right tabular-nums',
                                profit < 0 && 'text-red-600',
                              )}
                            >
                              {formatRupiah(profit)}
                            </TableCell>
                          </TableRow>
                        )
                      },
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section B — Per Model */}
      <Card>
        <CardHeader>
          <CardTitle>Performa Per Model</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Pesan</TableHead>
                  <TableHead className="text-right">Cost API</TableHead>
                  <TableHead className="text-right">Pendapatan</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byModel.map((m) => (
                  <TableRow key={m.modelId}>
                    <TableCell>
                      <div className="font-medium">{m.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {m.provider}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(m.messages)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRupiah(m.apiCostRp)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRupiah(m.revenueRp)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums font-medium',
                        m.profitRp < 0 && 'text-red-600',
                      )}
                    >
                      {formatRupiah(m.profitRp)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.marginPct.toFixed(1)}%
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={cn(
                          'font-normal',
                          STATUS_STYLE[m.status],
                        )}
                      >
                        {STATUS_LABEL[m.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {byModel.length === 0 && !loading && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Belum ada data pesan AI di range ini.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Section B-2 — Per AI Feature (Content Studio dst) */}
      <Card>
        <CardHeader>
          <CardTitle>Performa Per AI Feature</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Cost API</TableHead>
                  <TableHead className="text-right">Pendapatan</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byFeature.map((f) => (
                  <TableRow key={f.featureKey}>
                    <TableCell>
                      <div className="font-medium">{f.displayName}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {f.featureKey}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {f.modelName ?? '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(f.calls)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRupiah(f.apiCostRp)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRupiah(f.revenueRp)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums font-medium',
                        f.profitRp < 0 && 'text-red-600',
                      )}
                    >
                      {formatRupiah(f.profitRp)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {f.marginPct.toFixed(1)}%
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={cn(
                          'font-normal',
                          STATUS_STYLE[f.status],
                        )}
                      >
                        {STATUS_LABEL[f.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {byFeature.length === 0 && !loading && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Belum ada call AI feature di range ini.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Section C — Top Users */}
      <Card>
        <CardHeader>
          <CardTitle>Top Users by Usage</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="text-right">Pesan</TableHead>
                  <TableHead className="text-right">Cost API</TableHead>
                  <TableHead className="text-right">Pendapatan</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byUser.map((u) => (
                  <TableRow key={u.userId}>
                    <TableCell>
                      <div className="font-medium">{u.name ?? u.email}</div>
                      <div className="text-xs text-muted-foreground">
                        {u.email}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(u.messages)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRupiah(u.apiCostRp)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRupiah(u.revenueRp)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums font-medium',
                        u.profitRp < 0 && 'text-red-600',
                      )}
                    >
                      {formatRupiah(u.profitRp)}
                    </TableCell>
                  </TableRow>
                ))}
                {byUser.length === 0 && !loading && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Belum ada data pesan AI di range ini.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string
  value: string
  hint?: React.ReactNode
  emphasis?: 'positive' | 'negative'
}) {
  return (
    <div className="rounded-md border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 font-display text-2xl font-bold tabular-nums',
          emphasis === 'negative' && 'text-red-600',
          emphasis === 'positive' && 'text-emerald-700',
        )}
      >
        {value}
      </p>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}
