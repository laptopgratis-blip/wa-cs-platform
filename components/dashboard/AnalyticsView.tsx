'use client'

// AnalyticsView — fetch /api/analytics/user, render stats + 2 charts +
// 3 tabel. Refresh manual via tombol di topbar.
import type { PipelineStage, WaStatus } from '@prisma/client'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Coins,
  Loader2,
  MessageSquare,
  PauseCircle,
  Percent,
  RefreshCw,
  Smartphone,
  Users,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Stats {
  totalIncoming: number
  totalAiOutgoing: number
  totalContacts: number
  tokensUsed: number
  responseRate: number
}

interface DailyPoint {
  dateISO: string
  label: string
  USER: number
  AI: number
  HUMAN: number
  tokens: number
}

interface SessionRow {
  id: string
  phoneNumber: string | null
  displayName: string | null
  status: WaStatus
  totalMessages: number
  aiMessages: number
  totalContacts: number
  estimatedTokens: number
}

interface RecentContact {
  id: string
  phoneNumber: string
  name: string | null
  pipelineStage: PipelineStage
  lastMessageAt: string | null
  lastMessage: {
    content: string
    role: 'USER' | 'AI' | 'HUMAN' | 'AGENT'
    createdAt: string
  } | null
}

interface PipelineRow {
  stage: PipelineStage
  count: number
}

interface AnalyticsData {
  stats: Stats
  dailySeries: DailyPoint[]
  sessions: SessionRow[]
  recentContacts: RecentContact[]
  pipeline: PipelineRow[]
  range: { sinceISO: string; days: number }
}

const PIPELINE_LABEL: Record<PipelineStage, string> = {
  NEW: 'Baru',
  PROSPECT: 'Prospek',
  INTEREST: 'Tertarik',
  NEGOTIATION: 'Negosiasi',
  CLOSED_WON: 'Menang (Beli)',
  CLOSED_LOST: 'Kalah (Tidak Jadi)',
}

const PIPELINE_COLOR: Record<PipelineStage, string> = {
  NEW: 'bg-warm-300',
  PROSPECT: 'bg-blue-400',
  INTEREST: 'bg-amber-400',
  NEGOTIATION: 'bg-violet-400',
  CLOSED_WON: 'bg-emerald-500',
  CLOSED_LOST: 'bg-rose-400',
}

const STATUS_LABEL: Record<WaStatus, string> = {
  DISCONNECTED: 'Terputus',
  CONNECTING: 'Menghubungkan',
  WAITING_QR: 'Menunggu QR',
  CONNECTED: 'Aktif',
  PAUSED: 'Dijeda',
  ERROR: 'Error',
}

function StatusBadge({ status }: { status: WaStatus }) {
  if (status === 'CONNECTED') {
    return (
      <Badge className="gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        <CheckCircle2 className="size-3" />
        {STATUS_LABEL[status]}
      </Badge>
    )
  }
  if (status === 'PAUSED') {
    return (
      <Badge variant="secondary" className="gap-1 bg-amber-100 text-amber-700">
        <PauseCircle className="size-3" />
        {STATUS_LABEL[status]}
      </Badge>
    )
  }
  if (status === 'ERROR') {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="size-3" />
        {STATUS_LABEL[status]}
      </Badge>
    )
  }
  return <Badge variant="outline">{STATUS_LABEL[status]}</Badge>
}

const TOOLTIP_STYLE = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--popover-foreground)',
  fontSize: 12,
}

export function AnalyticsView() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [isRefreshing, setRefreshing] = useState(false)

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true)
    else setRefreshing(true)
    try {
      const res = await fetch('/api/analytics/user')
      const json = (await res.json()) as { success: boolean; data?: AnalyticsData; error?: string }
      if (!res.ok || !json.success || !json.data) {
        toast.error(json.error || 'Gagal memuat analytics')
        return
      }
      setData(json.data)
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      if (initial) setLoading(false)
      else setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load(true)
  }, [load])

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!data) {
    return (
      <div className="flex h-96 items-center justify-center text-sm text-muted-foreground">
        Tidak ada data analytics.
      </div>
    )
  }

  const totalPipeline = data.pipeline.reduce((s, p) => s + p.count, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
            Analytics
          </h1>
          <p className="mt-1 text-sm text-warm-500">
            Ringkasan {data.range.days} hari terakhir untuk semua WhatsApp kamu.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load(false)}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <Loader2 className="mr-2 size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 size-3.5" />
          )}
          Refresh
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={ArrowDownLeft}
          label="Pesan Masuk"
          value={data.stats.totalIncoming}
          color="text-blue-600"
          bg="bg-blue-50"
        />
        <StatCard
          icon={ArrowUpRight}
          label="Balasan AI"
          value={data.stats.totalAiOutgoing}
          color="text-primary-600"
          bg="bg-primary-50"
        />
        <StatCard
          icon={Users}
          label="Total Kontak"
          value={data.stats.totalContacts}
          color="text-emerald-600"
          bg="bg-emerald-50"
        />
        <StatCard
          icon={Coins}
          label="Token Terpakai"
          value={data.stats.tokensUsed}
          color="text-amber-600"
          bg="bg-amber-50"
        />
        <StatCard
          icon={Percent}
          label="Response Rate"
          value={`${data.stats.responseRate}%`}
          color="text-violet-600"
          bg="bg-violet-50"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-xl border-warm-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Pesan Masuk vs Balasan AI
            </CardTitle>
            <CardDescription className="text-xs">
              {data.range.days} hari terakhir
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.dailySeries}
                  margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="USER"
                    name="Pesan Masuk"
                    fill="#60a5fa"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="AI"
                    name="Balasan AI"
                    fill="#f97316"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-warm-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Token Terpakai per Hari
            </CardTitle>
            <CardDescription className="text-xs">
              {data.range.days} hari terakhir
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data.dailySeries}
                  margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Line
                    type="monotone"
                    dataKey="tokens"
                    name="Token"
                    stroke="#d97706"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline */}
      <Card className="rounded-xl border-warm-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Pipeline Kontak</CardTitle>
          <CardDescription className="text-xs">
            Distribusi {formatNumber(totalPipeline)} kontak per stage
          </CardDescription>
        </CardHeader>
        <CardContent>
          {totalPipeline === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Belum ada kontak.
            </p>
          ) : (
            <div className="space-y-3">
              {(Object.keys(PIPELINE_LABEL) as PipelineStage[]).map((stage) => {
                const row = data.pipeline.find((p) => p.stage === stage)
                const count = row?.count ?? 0
                const pct = totalPipeline > 0 ? (count / totalPipeline) * 100 : 0
                return (
                  <div key={stage} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className={cn('size-2 rounded-full', PIPELINE_COLOR[stage])}
                        />
                        <span className="font-medium text-warm-700">
                          {PIPELINE_LABEL[stage]}
                        </span>
                      </div>
                      <div className="text-warm-500 tabular-nums">
                        {formatNumber(count)} · {pct.toFixed(1)}%
                      </div>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-session table */}
      <Card className="rounded-xl border-warm-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            Performa WhatsApp Session
          </CardTitle>
          <CardDescription className="text-xs">
            Statistik per nomor WA yang terhubung
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nomor / Nama</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total Pesan</TableHead>
                <TableHead className="text-right">Balasan AI</TableHead>
                <TableHead className="text-right">Kontak</TableHead>
                <TableHead className="text-right">Token (estimasi)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.sessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Belum ada WhatsApp session.
                  </TableCell>
                </TableRow>
              ) : (
                data.sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Smartphone className="size-3.5 text-warm-500" />
                        <div>
                          <div className="font-medium tabular-nums">
                            {s.phoneNumber ?? '—'}
                          </div>
                          {s.displayName && (
                            <div className="text-xs text-muted-foreground">
                              {s.displayName}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(s.totalMessages)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(s.aiMessages)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(s.totalContacts)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-amber-600">
                      ~{formatNumber(s.estimatedTokens)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent contacts table */}
      <Card className="rounded-xl border-warm-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Kontak Terbaru</CardTitle>
          <CardDescription className="text-xs">
            10 kontak yang terakhir kirim/terima pesan
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kontak</TableHead>
                <TableHead className="hidden md:table-cell">Pesan Terakhir</TableHead>
                <TableHead>Pipeline</TableHead>
                <TableHead className="text-right">Waktu</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentContacts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Belum ada percakapan.
                  </TableCell>
                </TableRow>
              ) : (
                data.recentContacts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <MessageSquare className="size-3.5 text-warm-500" />
                        <div>
                          <div className="font-medium">
                            {c.name ?? c.phoneNumber}
                          </div>
                          <div className="text-xs text-muted-foreground tabular-nums">
                            {c.phoneNumber}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden max-w-md text-sm text-warm-600 md:table-cell">
                      {c.lastMessage ? (
                        <div className="truncate">
                          <span
                            className={cn(
                              'mr-1.5 inline-block rounded px-1.5 text-[10px] font-semibold',
                              c.lastMessage.role === 'USER'
                                ? 'bg-blue-100 text-blue-700'
                                : c.lastMessage.role === 'AI'
                                  ? 'bg-primary-100 text-primary-700'
                                  : 'bg-warm-200 text-warm-700',
                            )}
                          >
                            {c.lastMessage.role}
                          </span>
                          {c.lastMessage.content}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1.5 font-normal">
                        <span
                          aria-hidden
                          className={cn(
                            'size-1.5 rounded-full',
                            PIPELINE_COLOR[c.pipelineStage],
                          )}
                        />
                        {PIPELINE_LABEL[c.pipelineStage]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {c.lastMessageAt
                        ? new Date(c.lastMessageAt).toLocaleString('id-ID', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

interface StatCardProps {
  icon: typeof Users
  label: string
  value: number | string
  color: string
  bg: string
}

function StatCard({ icon: Icon, label, value, color, bg }: StatCardProps) {
  return (
    <Card className="rounded-xl border-warm-200">
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={cn(
            'flex size-10 items-center justify-center rounded-lg',
            bg,
            color,
          )}
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-warm-500">{label}</div>
          <div className="font-display text-xl font-bold tabular-nums text-warm-900 dark:text-warm-50">
            {typeof value === 'number' ? formatNumber(value) : value}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
