'use client'

// Analytics seller per course — Phase 5.
// Single client component, fetch sekali per pilihan range:
//   - Summary cards (5 metrics)
//   - Enrollment-over-time bar chart (SVG native)
//   - Lesson funnel/breakdown table dgn drop-off antar lesson
//
// Mirror style dari /components/lp-lab/* — warna warm + primary-orange.
import {
  Award,
  BarChart3,
  Loader2,
  TrendingUp,
  UserCheck,
  Users,
  Hourglass,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { EmptyState } from '@/components/shared/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type {
  CourseAnalyticsResult,
  CourseAnalyticsSeries,
  CourseAnalyticsLesson,
} from '@/lib/services/lms/analytics'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

type Range = 7 | 30 | 90

interface Props {
  courseId: string
}

export function CourseAnalyticsClient({ courseId }: Props) {
  const [data, setData] = useState<CourseAnalyticsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState<Range>(30)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(
      `/api/lms/courses/${encodeURIComponent(courseId)}/analytics?days=${days}`,
      { cache: 'no-store' },
    )
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        if (j.success) setData(j.data as CourseAnalyticsResult)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [courseId, days])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="border-warm-300 flex gap-0.5 rounded-md border p-0.5">
          {([7, 30, 90] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`rounded px-3 py-1 text-xs font-medium ${
                days === d
                  ? 'bg-primary-500 text-warm-900'
                  : 'text-warm-600 hover:bg-warm-100'
              }`}
            >
              {d} hari
            </button>
          ))}
        </div>
        {loading && (
          <span className="text-warm-500 flex items-center gap-1 text-xs">
            <Loader2 className="size-4 animate-spin" />
            Memuat…
          </span>
        )}
      </div>

      {!loading && !data && (
        <EmptyState bordered icon={BarChart3} title="Gagal memuat analytics." />
      )}

      {data && (
        <>
          <SummaryCards summary={data.summary} />

          <div className="grid gap-6 lg:grid-cols-2">
            <EnrollmentChart
              series={data.enrollmentSeries}
              days={data.rangeDays}
            />
            <LessonsFunnel lessons={data.lessons} />
          </div>

          <LessonsBreakdown lessons={data.lessons} />
        </>
      )}
    </div>
  )
}

// ────────────────────────── Summary Cards ──────────────────────────

function SummaryCards({
  summary,
}: {
  summary: CourseAnalyticsResult['summary']
}) {
  const completionPct = (summary.completionRate * 100).toFixed(0)
  const avgDays =
    summary.avgDaysToComplete !== null
      ? summary.avgDaysToComplete.toFixed(1)
      : '—'

  // Ikon stat tile pakai aksen brand tunggal — yang membedakan makna adalah
  // ikonnya, bukan hue dekoratif per kartu.
  const cards = [
    {
      label: 'Total Enrollment',
      value: summary.totalEnrollments.toLocaleString('id-ID'),
      Icon: Users,
    },
    {
      label: 'Active 7 hari',
      value: summary.activeStudents7d.toLocaleString('id-ID'),
      Icon: UserCheck,
    },
    {
      label: 'Completion Rate',
      value: `${completionPct}%`,
      Icon: TrendingUp,
    },
    {
      label: 'Sertifikat Terbit',
      value: summary.totalCertificates.toLocaleString('id-ID'),
      Icon: Award,
    },
    {
      label: 'Avg Hari Selesai',
      value: avgDays,
      Icon: Hourglass,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="p-3">
            <div className="mb-1 flex items-center gap-1.5">
              <c.Icon className="text-primary-600 size-4" />
              <span className="text-warm-500 text-xs font-medium tracking-wide uppercase">
                {c.label}
              </span>
            </div>
            <div className="font-display text-warm-900 text-xl font-semibold tabular-nums">
              {c.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ────────────────────────── Enrollment Chart ──────────────────────────

function EnrollmentChart({
  series,
  days,
}: {
  series: CourseAnalyticsSeries[]
  days: number
}) {
  const chart = useMemo(() => {
    if (series.length === 0) return null
    const W = 480
    const H = 180
    const PAD_X = 30
    const PAD_Y = 20
    const max = Math.max(1, ...series.map((s) => s.count))
    const barW = (W - PAD_X * 2) / series.length
    const xOf = (i: number) => PAD_X + i * barW + barW * 0.1
    const wOf = barW * 0.8
    const yOf = (v: number) => H - PAD_Y - (v / max) * (H - PAD_Y * 2)
    return { W, H, PAD_X, PAD_Y, max, barW, xOf, wOf, yOf }
  }, [series])

  const total = series.reduce((acc, s) => acc + s.count, 0)

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-warm-900 text-lg font-semibold">
            <Users className="mr-1 inline size-4" /> Enrollment Harian
          </h3>
          <span className="text-warm-500 text-xs">
            {total.toLocaleString('id-ID')} total dalam {days} hari
          </span>
        </div>

        {!chart || total === 0 ? (
          <EmptyState
            bordered
            title={`Belum ada enrollment dalam window ${days} hari.`}
          />
        ) : (
          <svg
            viewBox={`0 0 ${chart.W} ${chart.H}`}
            className="w-full"
            preserveAspectRatio="xMinYMin meet"
          >
            {/* Y-axis grid */}
            {[0, 0.5, 1].map((f) => {
              const v = Math.round(chart.max * f)
              return (
                <g key={f}>
                  <line
                    x1={chart.PAD_X}
                    x2={chart.W - chart.PAD_X / 2}
                    y1={chart.yOf(v)}
                    y2={chart.yOf(v)}
                    className="stroke-warm-200"
                    strokeWidth={1}
                    strokeDasharray={f === 0 ? '' : '2,4'}
                  />
                  <text
                    x={chart.PAD_X - 4}
                    y={chart.yOf(v) + 3}
                    textAnchor="end"
                    className="fill-warm-500 text-xs"
                  >
                    {v}
                  </text>
                </g>
              )
            })}

            {/* Bars */}
            {series.map((s, i) => {
              const h = chart.H - chart.PAD_Y - chart.yOf(s.count)
              return (
                <rect
                  key={s.date}
                  x={chart.xOf(i)}
                  y={chart.yOf(s.count)}
                  width={chart.wOf}
                  height={Math.max(0, h)}
                  rx={1.5}
                  className={s.count > 0 ? 'fill-primary-500' : 'fill-warm-200'}
                >
                  <title>
                    {new Date(s.date).toLocaleDateString('id-ID', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                    : {s.count} enrollment
                  </title>
                </rect>
              )
            })}

            {/* X-axis labels — first, mid, last */}
            {series.length > 1 &&
              [0, Math.floor(series.length / 2), series.length - 1].map((i) => {
                const s = series[i]
                if (!s) return null
                return (
                  <text
                    key={i}
                    x={chart.xOf(i) + chart.wOf / 2}
                    y={chart.H - 4}
                    textAnchor="middle"
                    className="fill-warm-500 text-xs"
                  >
                    {new Date(s.date).toLocaleDateString('id-ID', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </text>
                )
              })}
          </svg>
        )}
      </CardContent>
    </Card>
  )
}

// ────────────────────────── Lessons Funnel ──────────────────────────

function LessonsFunnel({ lessons }: { lessons: CourseAnalyticsLesson[] }) {
  if (lessons.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <h3 className="font-display text-warm-900 mb-3 text-lg font-semibold">
            <TrendingUp className="mr-1 inline size-4" /> Funnel Lesson
          </h3>
          <EmptyState bordered title="Course belum punya lesson." />
        </CardContent>
      </Card>
    )
  }

  const max = Math.max(1, ...lessons.map((l) => l.started))

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="font-display text-warm-900 mb-3 text-lg font-semibold">
          <TrendingUp className="mr-1 inline size-4" /> Funnel Lesson
        </h3>
        <div className="space-y-2">
          {lessons.map((l) => {
            const pct = max > 0 ? (l.started / max) * 100 : 0
            const completedPct = max > 0 ? (l.completed / max) * 100 : 0
            return (
              <div key={l.lessonId}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                  <div className="text-warm-700 min-w-0 flex-1 truncate font-medium">
                    <span className="bg-primary-100 text-primary-700 mr-1.5 inline-block size-5 rounded-full text-center text-xs leading-5 font-semibold">
                      {l.index}
                    </span>
                    {l.title}
                  </div>
                  <div className="text-warm-600 shrink-0 tabular-nums">
                    <span className="text-warm-900 font-semibold">
                      {l.started}
                    </span>
                    <span className="text-warm-400">/{l.completed}</span>
                    {l.dropFromPrev !== null && l.dropFromPrev > 0.05 && (
                      <span className={cn('ml-2', TONES.danger.text)}>
                        −{(l.dropFromPrev * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="bg-warm-100 relative h-2 w-full overflow-hidden rounded-full">
                  <div
                    className="bg-primary-300 absolute inset-y-0 left-0"
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                  <div
                    className={cn(
                      'absolute inset-y-0 left-0',
                      TONES.success.dot,
                    )}
                    style={{ width: `${Math.max(0, completedPct)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
        <div className="text-warm-500 mt-3 flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="bg-primary-300 size-2 rounded-full" />
            Started
          </span>
          <span className="flex items-center gap-1">
            <span className={cn('size-2 rounded-full', TONES.success.dot)} />
            Completed
          </span>
          <span className="flex items-center gap-1">
            <span className={TONES.danger.text}>−%</span>
            Drop dari lesson sebelumnya
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

// ────────────────────────── Lessons Breakdown Table ──────────────────────────

function LessonsBreakdown({ lessons }: { lessons: CourseAnalyticsLesson[] }) {
  if (lessons.length === 0) return null

  const maxDrop = lessons.reduce(
    (acc, l) =>
      l.dropFromPrev !== null && l.dropFromPrev > (acc?.dropFromPrev ?? 0)
        ? l
        : acc,
    null as CourseAnalyticsLesson | null,
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-warm-900 text-lg font-semibold">
          Per-Lesson Breakdown
        </h3>
        {maxDrop && maxDrop.dropFromPrev && maxDrop.dropFromPrev > 0.1 && (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              TONES.danger.bg,
              TONES.danger.text,
            )}
          >
            Dropout terbesar: Lesson {maxDrop.index} — {maxDrop.title} (−
            {(maxDrop.dropFromPrev * 100).toFixed(0)}%)
          </span>
        )}
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Lesson</TableHead>
              <TableHead>Module</TableHead>
              <TableHead className="text-right">Started</TableHead>
              <TableHead className="text-right">Completed</TableHead>
              <TableHead className="text-right">Completion</TableHead>
              <TableHead className="text-right">Drop ↓</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lessons.map((l) => {
              const dropBig = l.dropFromPrev !== null && l.dropFromPrev > 0.2
              return (
                <TableRow key={l.lessonId}>
                  <TableCell className="text-warm-500 tabular-nums">
                    {l.index}
                  </TableCell>
                  <TableCell className="text-warm-900 font-medium">
                    {l.title}
                  </TableCell>
                  <TableCell className="text-warm-600">
                    {l.moduleTitle}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.started}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.completed}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(l.completionRate * 100).toFixed(0)}%
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right tabular-nums',
                      dropBig
                        ? cn('font-semibold', TONES.danger.text)
                        : 'text-warm-500',
                    )}
                  >
                    {l.dropFromPrev === null
                      ? '—'
                      : `${(l.dropFromPrev * 100).toFixed(0)}%`}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
