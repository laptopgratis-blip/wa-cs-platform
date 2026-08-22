'use client'

// AnalyticsView — fetch /api/analytics/user, render stats + 2 charts +
// 3 tabel. Refresh manual via tombol di topbar.
import type { PipelineStage, WaStatus } from '@prisma/client'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Coins,
  Loader2,
  MessageSquare,
  Percent,
  RefreshCw,
  Smartphone,
  Users,
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
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { CardGridSkeleton } from '@/components/shared/skeletons'
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
import {
  pipelineStageMeta,
  statusMeta,
  waSessionStatusMeta,
} from '@/lib/status'
import { TONES } from '@/lib/ui-tones'
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

// Urutan tampil stage pipeline — label & tone dari registry lib/status.ts.
const PIPELINE_ORDER: PipelineStage[] = [
  'NEW',
  'PROSPECT',
  'INTEREST',
  'NEGOTIATION',
  'CLOSED_WON',
  'CLOSED_LOST',
]

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
      const json = (await res.json()) as {
        success: boolean
        data?: AnalyticsData
        error?: string
      }
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
    return <CardGridSkeleton count={5} />
  }
  if (!data) {
    return (
      <EmptyState
        title="Tidak ada data analytics"
        description="Data terkumpul otomatis begitu ada aktivitas chat di WhatsApp kamu."
      />
    )
  }

  const totalPipeline = data.pipeline.reduce((s, p) => s + p.count, 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description={`Ringkasan ${data.range.days} hari terakhir untuk semua WhatsApp kamu.`}
        actions={
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
        }
      />

      {/* Stats cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={ArrowDownLeft}
          label="Pesan Masuk"
          value={data.stats.totalIncoming}
          color="text-primary-600"
          bg="bg-primary-50"
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
          color="text-primary-600"
          bg="bg-primary-50"
        />
        <StatCard
          icon={Coins}
          label="Token Terpakai"
          value={data.stats.tokensUsed}
          color="text-primary-600"
          bg="bg-primary-50"
        />
        <StatCard
          icon={Percent}
          label="Response Rate"
          value={`${data.stats.responseRate}%`}
          color="text-primary-600"
          bg="bg-primary-50"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
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
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-border"
                  />
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
                    fill="var(--chart-2)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="AI"
                    name="Balasan AI"
                    fill="var(--chart-1)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
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
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-border"
                  />
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
                    stroke="var(--chart-1)"
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
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            Pipeline Kontak
          </CardTitle>
          <CardDescription className="text-xs">
            Distribusi {formatNumber(totalPipeline)} kontak per stage
          </CardDescription>
        </CardHeader>
        <CardContent>
          {totalPipeline === 0 ? (
            <EmptyState
              title="Belum ada kontak"
              description="Kontak masuk otomatis begitu ada customer yang chat."
            />
          ) : (
            <div className="space-y-3">
              {PIPELINE_ORDER.map((stage) => {
                const row = data.pipeline.find((p) => p.stage === stage)
                const count = row?.count ?? 0
                const pct =
                  totalPipeline > 0 ? (count / totalPipeline) * 100 : 0
                const meta = statusMeta(pipelineStageMeta, stage)
                return (
                  <div key={stage} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className={cn(
                            'size-2 rounded-full',
                            TONES[meta.tone].dot,
                          )}
                        />
                        <span className="text-warm-700 font-medium">
                          {meta.label}
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
      <Card>
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
                  <TableCell colSpan={6}>
                    <EmptyState
                      title="Belum ada WhatsApp session"
                      description="Hubungkan WA dulu di menu WhatsApp."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                data.sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Smartphone className="text-warm-500 size-3.5" />
                        <div>
                          <div className="font-medium tabular-nums">
                            {s.phoneNumber ?? '—'}
                          </div>
                          {s.displayName && (
                            <div className="text-muted-foreground text-xs">
                              {s.displayName}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={statusMeta(waSessionStatusMeta, s.status).tone}
                        label={statusMeta(waSessionStatusMeta, s.status).label}
                      />
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
                    <TableCell className="text-primary-600 text-right tabular-nums">
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
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            Kontak Terbaru
          </CardTitle>
          <CardDescription className="text-xs">
            10 kontak yang terakhir kirim/terima pesan
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kontak</TableHead>
                <TableHead className="hidden md:table-cell">
                  Pesan Terakhir
                </TableHead>
                <TableHead>Pipeline</TableHead>
                <TableHead className="text-right">Waktu</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentContacts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    <EmptyState
                      title="Belum ada percakapan"
                      description="Chat customer terbaru bakal muncul di sini."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                data.recentContacts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <MessageSquare className="text-warm-500 size-3.5" />
                        <div>
                          <div className="font-medium">
                            {c.name ?? c.phoneNumber}
                          </div>
                          <div className="text-muted-foreground text-xs tabular-nums">
                            {c.phoneNumber}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-warm-600 hidden max-w-md text-sm md:table-cell">
                      {c.lastMessage ? (
                        <div className="truncate">
                          <span
                            className={cn(
                              'mr-1.5 inline-block rounded px-1.5 text-xs font-semibold',
                              c.lastMessage.role === 'USER'
                                ? cn(TONES.info.bg, TONES.info.text)
                                : c.lastMessage.role === 'AI'
                                  ? cn(TONES.brand.bg, TONES.brand.text)
                                  : cn(TONES.neutral.bg, TONES.neutral.text),
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
                            TONES[
                              statusMeta(pipelineStageMeta, c.pipelineStage)
                                .tone
                            ].dot,
                          )}
                        />
                        {statusMeta(pipelineStageMeta, c.pipelineStage).label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right text-xs">
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
    <Card>
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
          <div className="text-warm-500 text-xs">{label}</div>
          <div className="font-display text-warm-900 text-xl font-bold tabular-nums">
            {typeof value === 'number' ? formatNumber(value) : value}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
