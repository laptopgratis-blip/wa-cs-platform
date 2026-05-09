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
  Loader2,
  TrendingUp,
  UserCheck,
  Users,
  Hourglass,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import type {
  CourseAnalyticsResult,
  CourseAnalyticsSeries,
  CourseAnalyticsLesson,
} from '@/lib/services/lms/analytics'

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
        <div className="flex gap-0.5 rounded-md border border-warm-300 p-0.5">
          {([7, 30, 90] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`rounded px-3 py-1 text-xs font-medium ${
                days === d
                  ? 'bg-primary-500 text-white'
                  : 'text-warm-600 hover:bg-warm-100'
              }`}
            >
              {d} hari
            </button>
          ))}
        </div>
        {loading && (
          <span className="flex items-center gap-1 text-xs text-warm-500">
            <Loader2 className="size-3 animate-spin" />
            Memuat…
          </span>
        )}
      </div>

      {!loading && !data && (
        <div className="rounded border border-dashed border-warm-200 bg-warm-50 py-12 text-center text-sm text-warm-500">
          Gagal memuat analytics.
        </div>
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

  const cards = [
    {
      label: 'Total Enrollment',
      value: summary.totalEnrollments.toLocaleString('id-ID'),
      Icon: Users,
      tone: 'text-primary-600',
    },
    {
      label: 'Active 7 hari',
      value: summary.activeStudents7d.toLocaleString('id-ID'),
      Icon: UserCheck,
      tone: 'text-blue-600',
    },
    {
      label: 'Completion Rate',
      value: `${completionPct}%`,
      Icon: TrendingUp,
      tone: 'text-emerald-600',
    },
    {
      label: 'Sertifikat Terbit',
      value: summary.totalCertificates.toLocaleString('id-ID'),
      Icon: Award,
      tone: 'text-amber-600',
    },
    {
      label: 'Avg Hari Selesai',
      value: avgDays,
      Icon: Hourglass,
      tone: 'text-purple-600',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl border border-warm-200 bg-white p-3"
        >
          <div className="mb-1 flex items-center gap-1.5">
            <c.Icon className={`size-4 ${c.tone}`} />
            <span className="text-[11px] font-medium uppercase tracking-wide text-warm-500">
              {c.label}
            </span>
          </div>
          <div className="font-display text-xl font-bold tabular-nums text-warm-900">
            {c.value}
          </div>
        </div>
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
    <div className="rounded-xl border border-warm-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-warm-900">
          <Users className="mr-1 inline size-4" /> Enrollment Harian
        </h3>
        <span className="text-xs text-warm-500">
          {total.toLocaleString('id-ID')} total dalam {days} hari
        </span>
      </div>

      {!chart || total === 0 ? (
        <div className="rounded border border-dashed border-warm-200 bg-warm-50 py-12 text-center text-xs text-warm-500">
          Belum ada enrollment dalam window {days} hari.
        </div>
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
                  className="fill-warm-500 text-[9px]"
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
                className={
                  s.count > 0 ? 'fill-primary-500' : 'fill-warm-200'
                }
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
                  className="fill-warm-500 text-[9px]"
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
    </div>
  )
}

// ────────────────────────── Lessons Funnel ──────────────────────────

function LessonsFunnel({ lessons }: { lessons: CourseAnalyticsLesson[] }) {
  if (lessons.length === 0) {
    return (
      <div className="rounded-xl border border-warm-200 bg-white p-4">
        <h3 className="mb-3 font-display text-sm font-semibold text-warm-900">
          <TrendingUp className="mr-1 inline size-4" /> Funnel Lesson
        </h3>
        <div className="rounded border border-dashed border-warm-200 bg-warm-50 py-12 text-center text-xs text-warm-500">
          Course belum punya lesson.
        </div>
      </div>
    )
  }

  const max = Math.max(1, ...lessons.map((l) => l.started))

  return (
    <div className="rounded-xl border border-warm-200 bg-white p-4">
      <h3 className="mb-3 font-display text-sm font-semibold text-warm-900">
        <TrendingUp className="mr-1 inline size-4" /> Funnel Lesson
      </h3>
      <div className="space-y-2">
        {lessons.map((l) => {
          const pct = max > 0 ? (l.started / max) * 100 : 0
          const completedPct =
            max > 0 ? (l.completed / max) * 100 : 0
          return (
            <div key={l.lessonId}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                <div className="min-w-0 flex-1 truncate font-medium text-warm-700">
                  <span className="mr-1.5 inline-block size-5 rounded-full bg-primary-100 text-center text-[10px] font-bold leading-5 text-primary-700">
                    {l.index}
                  </span>
                  {l.title}
                </div>
                <div className="shrink-0 tabular-nums text-warm-600">
                  <span className="font-semibold text-warm-900">
                    {l.started}
                  </span>
                  <span className="text-warm-400">/{l.completed}</span>
                  {l.dropFromPrev !== null && l.dropFromPrev > 0.05 && (
                    <span className="ml-2 text-rose-600">
                      −{(l.dropFromPrev * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-warm-100">
                <div
                  className="absolute inset-y-0 left-0 bg-primary-300"
                  style={{ width: `${Math.max(2, pct)}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 bg-emerald-500"
                  style={{ width: `${Math.max(0, completedPct)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex items-center gap-3 text-[11px] text-warm-500">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-primary-300" />
          Started
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-emerald-500" />
          Completed
        </span>
        <span className="flex items-center gap-1">
          <span className="text-rose-600">−%</span>
          Drop dari lesson sebelumnya
        </span>
      </div>
    </div>
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
    <div className="rounded-xl border border-warm-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-warm-900">
          Per-Lesson Breakdown
        </h3>
        {maxDrop && maxDrop.dropFromPrev && maxDrop.dropFromPrev > 0.1 && (
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
            Dropout terbesar: Lesson {maxDrop.index} — {maxDrop.title} (−
            {(maxDrop.dropFromPrev * 100).toFixed(0)}%)
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-warm-200 text-left text-warm-500">
              <th className="py-2 pr-2 font-medium">#</th>
              <th className="py-2 pr-2 font-medium">Lesson</th>
              <th className="py-2 pr-2 font-medium">Module</th>
              <th className="py-2 pr-2 text-right font-medium">Started</th>
              <th className="py-2 pr-2 text-right font-medium">Completed</th>
              <th className="py-2 pr-2 text-right font-medium">Completion</th>
              <th className="py-2 pr-2 text-right font-medium">Drop ↓</th>
            </tr>
          </thead>
          <tbody>
            {lessons.map((l) => {
              const dropBig =
                l.dropFromPrev !== null && l.dropFromPrev > 0.2
              return (
                <tr
                  key={l.lessonId}
                  className="border-b border-warm-100 last:border-0"
                >
                  <td className="py-2 pr-2 tabular-nums text-warm-500">
                    {l.index}
                  </td>
                  <td className="py-2 pr-2 font-medium text-warm-900">
                    {l.title}
                  </td>
                  <td className="py-2 pr-2 text-warm-600">{l.moduleTitle}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {l.started}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {l.completed}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {(l.completionRate * 100).toFixed(0)}%
                  </td>
                  <td
                    className={`py-2 pr-2 text-right tabular-nums ${
                      dropBig ? 'font-semibold text-rose-600' : 'text-warm-500'
                    }`}
                  >
                    {l.dropFromPrev === null
                      ? '—'
                      : `${(l.dropFromPrev * 100).toFixed(0)}%`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
