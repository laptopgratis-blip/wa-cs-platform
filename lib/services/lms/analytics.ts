// Analytics seller per course — Phase 5.
//
// Aggregate data:
//   - summary metrics (enrollment, completion, avg days, active 7d)
//   - enrollment series harian untuk window N hari
//   - per-lesson breakdown (started, completed, completion%, drop% vs prev)
//
// Ownership di-enforce di entry function: kalau course bukan milik userId,
// return null. Caller (page/route) yang handle redirect/404.

import { prisma } from '@/lib/prisma'

export interface CourseAnalyticsLesson {
  lessonId: string
  title: string
  moduleTitle: string
  // Index global (1..N) berdasarkan urutan module.sortOrder + lesson.sortOrder.
  // Dipakai untuk label funnel ("Lesson 1, 2, ...").
  index: number
  started: number
  completed: number
  completionRate: number // 0..1, completed/started (0 kalau started=0)
  // Drop dari lesson sebelumnya: 1 - (started_ini / completed_prev).
  // Null untuk lesson pertama. Negatif kalau started_ini > completed_prev
  // (mungkin lesson di-skip / unlock paralel) — clamp 0.
  dropFromPrev: number | null
}

export interface CourseAnalyticsSummary {
  totalEnrollments: number // ACTIVE only
  activeStudents7d: number // distinct enrollment dgn lastSeenAt dalam 7 hari
  totalCertificates: number
  completionRate: number // certs / totalEnrollments (0 kalau 0)
  avgDaysToComplete: number | null
  totalLessons: number
}

export interface CourseAnalyticsSeries {
  date: string // YYYY-MM-DD (UTC)
  count: number
}

export interface CourseAnalyticsResult {
  course: {
    id: string
    title: string
    slug: string
    status: string
  }
  rangeDays: number
  summary: CourseAnalyticsSummary
  enrollmentSeries: CourseAnalyticsSeries[]
  lessons: CourseAnalyticsLesson[]
}

const VALID_DAYS = [7, 30, 90] as const
export type AnalyticsRangeDays = (typeof VALID_DAYS)[number]

export function parseRangeDays(raw: string | null | undefined): AnalyticsRangeDays {
  const n = Number(raw)
  if (VALID_DAYS.includes(n as AnalyticsRangeDays)) {
    return n as AnalyticsRangeDays
  }
  return 30
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function getCourseAnalytics(
  userId: string,
  courseId: string,
  days: AnalyticsRangeDays,
): Promise<CourseAnalyticsResult | null> {
  const course = await prisma.course.findFirst({
    where: { id: courseId, userId },
    select: { id: true, title: true, slug: true, status: true },
  })
  if (!course) return null

  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const rangeStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

  const [
    totalEnrollments,
    totalCertificates,
    certs,
    activeGroup,
    enrollmentsInRange,
    lessons,
    progressStarted,
    progressCompleted,
  ] = await Promise.all([
    prisma.enrollment.count({
      where: { courseId, status: 'ACTIVE' },
    }),
    prisma.certificate.count({
      where: { enrollment: { courseId } },
    }),
    prisma.certificate.findMany({
      where: { enrollment: { courseId } },
      select: {
        issuedAt: true,
        enrollment: { select: { enrolledAt: true } },
      },
    }),
    prisma.lessonProgress.groupBy({
      by: ['enrollmentId'],
      where: {
        lastSeenAt: { gte: sevenDaysAgo },
        enrollment: { courseId },
      },
    }),
    prisma.enrollment.findMany({
      where: { courseId, enrolledAt: { gte: rangeStart } },
      select: { enrolledAt: true },
    }),
    prisma.lesson.findMany({
      where: { module: { courseId } },
      select: {
        id: true,
        title: true,
        sortOrder: true,
        module: { select: { id: true, title: true, sortOrder: true } },
      },
    }),
    prisma.lessonProgress.groupBy({
      by: ['lessonId'],
      where: { enrollment: { courseId } },
      _count: { _all: true },
    }),
    prisma.lessonProgress.groupBy({
      by: ['lessonId'],
      where: {
        enrollment: { courseId },
        completedAt: { not: null },
      },
      _count: { _all: true },
    }),
  ])

  // Avg days to complete = avg(certificate.issuedAt - enrollment.enrolledAt)
  let avgDaysToComplete: number | null = null
  if (certs.length > 0) {
    const sum = certs.reduce((acc, c) => {
      const ms = c.issuedAt.getTime() - c.enrollment.enrolledAt.getTime()
      return acc + ms
    }, 0)
    avgDaysToComplete = sum / certs.length / (1000 * 60 * 60 * 24)
  }

  const completionRate =
    totalEnrollments > 0 ? totalCertificates / totalEnrollments : 0

  // Enrollment series — bucket per hari UTC, fill nol untuk hari kosong.
  const seriesMap = new Map<string, number>()
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    seriesMap.set(toDateKey(d), 0)
  }
  for (const e of enrollmentsInRange) {
    const key = toDateKey(e.enrolledAt)
    if (seriesMap.has(key)) {
      seriesMap.set(key, (seriesMap.get(key) ?? 0) + 1)
    }
  }
  const enrollmentSeries: CourseAnalyticsSeries[] = Array.from(seriesMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Per-lesson breakdown — sort by module.sortOrder, then lesson.sortOrder.
  const sortedLessons = [...lessons].sort((a, b) => {
    if (a.module.sortOrder !== b.module.sortOrder) {
      return a.module.sortOrder - b.module.sortOrder
    }
    return a.sortOrder - b.sortOrder
  })

  const startedById = new Map<string, number>()
  for (const p of progressStarted) {
    startedById.set(p.lessonId, p._count._all)
  }
  const completedById = new Map<string, number>()
  for (const p of progressCompleted) {
    completedById.set(p.lessonId, p._count._all)
  }

  let prevCompleted: number | null = null
  const lessonsOut: CourseAnalyticsLesson[] = sortedLessons.map((l, idx) => {
    const started = startedById.get(l.id) ?? 0
    const completed = completedById.get(l.id) ?? 0
    const completionRate = started > 0 ? completed / started : 0
    let dropFromPrev: number | null = null
    if (prevCompleted !== null && prevCompleted > 0) {
      const drop = 1 - started / prevCompleted
      dropFromPrev = Math.max(0, Math.min(1, drop))
    }
    prevCompleted = completed
    return {
      lessonId: l.id,
      title: l.title,
      moduleTitle: l.module.title,
      index: idx + 1,
      started,
      completed,
      completionRate,
      dropFromPrev,
    }
  })

  return {
    course: {
      id: course.id,
      title: course.title,
      slug: course.slug,
      status: course.status,
    },
    rangeDays: days,
    summary: {
      totalEnrollments,
      activeStudents7d: activeGroup.length,
      totalCertificates,
      completionRate,
      avgDaysToComplete,
      totalLessons: lessons.length,
    },
    enrollmentSeries,
    lessons: lessonsOut,
  }
}
