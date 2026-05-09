// LMS Student Portal — query helper untuk halaman /belajar.
//
// Filter: hanya enrollment ACTIVE (REVOKED / EXPIRED tidak tampil) +
// course PUBLISHED. expiresAt enforce di service layer (kalau lewat,
// tampil sebagai EXPIRED — Phase 4 cron akan flip status secara berkala).
import { prisma } from '@/lib/prisma'

export interface StudentEnrollmentSummary {
  enrollmentId: string
  enrolledAt: Date
  expiresAt: Date | null
  course: {
    id: string
    slug: string
    title: string
    description: string | null
    coverUrl: string | null
    totalDurationSec: number
    moduleCount: number
    lessonCount: number
  }
  progressCount: number
  completedCount: number
}

// List enrollment student — dipakai di /belajar dashboard.
export async function getStudentEnrollments(
  studentPhone: string,
): Promise<StudentEnrollmentSummary[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentPhone,
      status: 'ACTIVE',
      course: { status: 'PUBLISHED' },
    },
    include: {
      course: {
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          coverUrl: true,
          totalDurationSec: true,
          modules: {
            select: { _count: { select: { lessons: true } } },
          },
        },
      },
      progress: {
        select: { id: true, completedAt: true },
      },
    },
    orderBy: { enrolledAt: 'desc' },
  })

  return enrollments.map((e) => {
    const lessonCount = e.course.modules.reduce(
      (acc, m) => acc + m._count.lessons,
      0,
    )
    const completedCount = e.progress.filter((p) => p.completedAt).length
    return {
      enrollmentId: e.id,
      enrolledAt: e.enrolledAt,
      expiresAt: e.expiresAt,
      course: {
        id: e.course.id,
        slug: e.course.slug,
        title: e.course.title,
        description: e.course.description,
        coverUrl: e.course.coverUrl,
        totalDurationSec: e.course.totalDurationSec,
        moduleCount: e.course.modules.length,
        lessonCount,
      },
      progressCount: e.progress.length,
      completedCount,
    }
  })
}

// Cek akses student ke course tertentu. Return enrollment kalau ACTIVE,
// null kalau tidak enroll (tapi course PUBLISHED → free preview lessons
// tetap accessible).
export async function getStudentEnrollmentForCourse(input: {
  studentPhone: string
  courseSlug: string
}) {
  // Course bisa dimiliki user mana saja — slug per-user unique tapi global
  // bisa duplikat. Kita pilih PUBLISHED + slug match. Kalau ada lebih dari
  // satu, ambil yg paling baru di-publish (tidak ideal tapi rare).
  const course = await prisma.course.findFirst({
    where: { slug: input.courseSlug, status: 'PUBLISHED' },
    orderBy: { updatedAt: 'desc' },
  })
  if (!course) return null

  const enrollment = await prisma.enrollment.findUnique({
    where: {
      courseId_studentPhone: {
        courseId: course.id,
        studentPhone: input.studentPhone,
      },
    },
    select: {
      id: true,
      status: true,
      enrolledAt: true,
      expiresAt: true,
    },
  })

  return {
    course,
    enrollment: enrollment?.status === 'ACTIVE' ? enrollment : null,
  }
}

// Detail course untuk player. Filter: lesson yg bukan free preview
// dilihat hanya kalau enrolled. Return modules + lessons sesuai gate.
export async function getCourseForStudent(input: {
  studentPhone: string | null // null = anon visitor (free preview only)
  courseSlug: string
}) {
  const course = await prisma.course.findFirst({
    where: { slug: input.courseSlug, status: 'PUBLISHED' },
    include: {
      modules: {
        orderBy: { sortOrder: 'asc' },
        include: { lessons: { orderBy: { sortOrder: 'asc' } } },
      },
    },
  })
  if (!course) return null

  let enrollment: {
    id: string
    enrolledAt: Date
    expiresAt: Date | null
  } | null = null
  let isEnrolled = false
  if (input.studentPhone) {
    const e = await prisma.enrollment.findUnique({
      where: {
        courseId_studentPhone: {
          courseId: course.id,
          studentPhone: input.studentPhone,
        },
      },
      select: {
        id: true,
        status: true,
        enrolledAt: true,
        expiresAt: true,
      },
    })
    if (e?.status === 'ACTIVE') {
      enrollment = {
        id: e.id,
        enrolledAt: e.enrolledAt,
        expiresAt: e.expiresAt,
      }
      isEnrolled = true
    }
  }

  // Fetch progress kalau enrolled
  let progressMap: Record<string, { watchedSec: number; completedAt: Date | null }> = {}
  if (enrollment) {
    const progress = await prisma.lessonProgress.findMany({
      where: { enrollmentId: enrollment.id },
      select: { lessonId: true, watchedSec: true, completedAt: true },
    })
    progressMap = Object.fromEntries(
      progress.map((p) => [
        p.lessonId,
        { watchedSec: p.watchedSec, completedAt: p.completedAt },
      ]),
    )
  }

  return {
    course: {
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.description,
      coverUrl: course.coverUrl,
      totalDurationSec: course.totalDurationSec,
    },
    isEnrolled,
    enrollment,
    modules: course.modules.map((m) => ({
      id: m.id,
      title: m.title,
      sortOrder: m.sortOrder,
      lessons: m.lessons.map((l) => {
        const accessible = isEnrolled || l.isFreePreview
        const prog = progressMap[l.id] ?? null
        return {
          id: l.id,
          title: l.title,
          contentType: l.contentType,
          durationSec: l.durationSec,
          isFreePreview: l.isFreePreview,
          sortOrder: l.sortOrder,
          // Konten asli hanya kalau accessible. Kalau locked, return
          // metadata saja supaya UI tampil daftar lesson dgn padlock.
          videoEmbedUrl: accessible ? l.videoEmbedUrl : null,
          richTextHtml: accessible ? l.richTextHtml : null,
          locked: !accessible,
          watchedSec: prog?.watchedSec ?? 0,
          completedAt: prog?.completedAt ?? null,
        }
      }),
    })),
  }
}

// Update progress lesson. Cek enrollment ACTIVE — kalau tidak, throw.
export async function updateLessonProgress(input: {
  studentPhone: string
  lessonId: string
  watchedSec: number
  completed?: boolean
}) {
  // Resolve lesson → course → enrollment dlm 1 query.
  const lesson = await prisma.lesson.findUnique({
    where: { id: input.lessonId },
    select: { id: true, module: { select: { courseId: true } } },
  })
  if (!lesson) throw new Error('Lesson tidak ditemukan')

  const enrollment = await prisma.enrollment.findUnique({
    where: {
      courseId_studentPhone: {
        courseId: lesson.module.courseId,
        studentPhone: input.studentPhone,
      },
    },
    select: { id: true, status: true },
  })
  if (!enrollment || enrollment.status !== 'ACTIVE') {
    throw new Error('Tidak punya akses ke lesson ini')
  }

  const watchedSec = Math.max(0, Math.min(input.watchedSec, 60 * 60 * 24))
  const completedAt = input.completed ? new Date() : undefined

  return prisma.lessonProgress.upsert({
    where: {
      enrollmentId_lessonId: {
        enrollmentId: enrollment.id,
        lessonId: input.lessonId,
      },
    },
    create: {
      enrollmentId: enrollment.id,
      lessonId: input.lessonId,
      watchedSec,
      completedAt,
    },
    update: {
      // Hanya update watchedSec kalau lebih besar — supaya seek mundur
      // tidak reset progress.
      watchedSec: { set: watchedSec },
      ...(input.completed && { completedAt: new Date() }),
    },
  })
}
