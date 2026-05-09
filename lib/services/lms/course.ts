// LMS Course service — CRUD course/module/lesson + slug generation +
// quota check.
//
// Phase 3: quota dari LmsQuota (tier-based). Default FREE = 1 course /
// 5 lesson. Upgrade plan via /pricing-lms (token billing).
//
// Slug: per-user unique (Course_userId_slug_key di schema). Generated dari
// title saat create; di-fallback ke `course-<short id>` kalau title kosong
// atau collision.
import type { CourseStatus, LessonContentType } from '@prisma/client'

import { prisma } from '@/lib/prisma'

import {
  checkLimitOrThrow,
  getActiveLmsQuota,
  isUnlimited,
} from './quota'

// Backward-compat constants (dipakai di UI page utk display badge limit).
// Real enforcement pakai LmsQuota live.
export const PHASE1_FREE_MAX_COURSES = 1
export const PHASE1_FREE_MAX_LESSONS_PER_COURSE = 5

// Slug — lowercase, alphanumeric + dash, max 60 char. Pakai pattern
// generic Indonesia (handle space, dash, underscore).
function slugifyTitle(title: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
  return base || 'course'
}

async function ensureUniqueSlug(userId: string, base: string): Promise<string> {
  let slug = base
  let suffix = 0
  // Loop sampai unique. 100 percobaan udah cukup paranoid.
  while (suffix < 100) {
    const existing = await prisma.course.findUnique({
      where: { userId_slug: { userId, slug } },
      select: { id: true },
    })
    if (!existing) return slug
    suffix += 1
    slug = `${base}-${suffix}`
  }
  // Sangat tidak mungkin terjadi — fallback ke timestamp.
  return `${base}-${Date.now().toString(36)}`
}

// ─────────────────────────────────────────
// Course CRUD
// ─────────────────────────────────────────

export interface CreateCourseInput {
  userId: string
  title: string
  description?: string | null
  coverUrl?: string | null
  // Optional: link langsung ke Product saat create. Validasi: product harus
  // milik userId yg sama dan belum punya courseId.
  productId?: string | null
}

export async function createCourse(input: CreateCourseInput) {
  // Quota check via LmsQuota — count course aktif (DRAFT | PUBLISHED).
  // Archived tidak hitung supaya user bisa archive yg lama lalu bikin baru.
  const quota = await getActiveLmsQuota(input.userId)
  if (!isUnlimited(quota.maxCourses)) {
    const activeCount = await prisma.course.count({
      where: {
        userId: input.userId,
        status: { in: ['DRAFT', 'PUBLISHED'] },
      },
    })
    if (activeCount >= quota.maxCourses) {
      const err = new Error(
        `Limit ${quota.tier}: max ${quota.maxCourses} course aktif. Upgrade plan LMS atau archive course lama.`,
      )
      ;(err as Error & { code?: string }).code = 'LMS_QUOTA_EXCEEDED'
      throw err
    }
  }

  const slug = await ensureUniqueSlug(input.userId, slugifyTitle(input.title))

  // Validate productId kalau dikasih
  if (input.productId) {
    const product = await prisma.product.findFirst({
      where: { id: input.productId, userId: input.userId },
      select: { id: true, courseId: true },
    })
    if (!product) {
      throw new Error('Product tidak ditemukan atau bukan milik kamu')
    }
    if (product.courseId) {
      throw new Error('Product ini sudah di-link ke course lain')
    }
  }

  // Create course + link product (opsional) dlm transaction.
  const course = await prisma.$transaction(async (tx) => {
    const c = await tx.course.create({
      data: {
        userId: input.userId,
        slug,
        title: input.title,
        description: input.description ?? null,
        coverUrl: input.coverUrl ?? null,
        status: 'DRAFT',
      },
    })
    if (input.productId) {
      await tx.product.update({
        where: { id: input.productId },
        data: { courseId: c.id },
      })
    }
    return c
  })

  return course
}

export async function getCourseForOwner(userId: string, courseId: string) {
  return prisma.course.findFirst({
    where: { id: courseId, userId },
    include: {
      modules: {
        orderBy: { sortOrder: 'asc' },
        include: { lessons: { orderBy: { sortOrder: 'asc' } } },
      },
      product: {
        select: { id: true, name: true, price: true, isActive: true },
      },
    },
  })
}

export async function listCoursesForOwner(userId: string) {
  return prisma.course.findMany({
    where: { userId },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: {
      product: { select: { id: true, name: true, price: true } },
      _count: { select: { modules: true, enrollments: true } },
    },
  })
}

export interface UpdateCourseInput {
  title?: string
  description?: string | null
  coverUrl?: string | null
  status?: CourseStatus
  // Re-link product. null = unlink.
  productId?: string | null | undefined
}

export async function updateCourse(
  userId: string,
  courseId: string,
  input: UpdateCourseInput,
) {
  const existing = await prisma.course.findFirst({
    where: { id: courseId, userId },
    include: { product: { select: { id: true } } },
  })
  if (!existing) throw new Error('Course tidak ditemukan')

  // Validate productId change kalau dikasih
  if (input.productId !== undefined) {
    if (input.productId) {
      const product = await prisma.product.findFirst({
        where: { id: input.productId, userId },
        select: { id: true, courseId: true },
      })
      if (!product) throw new Error('Product tidak ditemukan atau bukan milik kamu')
      if (product.courseId && product.courseId !== courseId) {
        throw new Error('Product ini sudah di-link ke course lain')
      }
    }
  }

  return prisma.$transaction(async (tx) => {
    const c = await tx.course.update({
      where: { id: courseId },
      data: {
        title: input.title,
        description: input.description,
        coverUrl: input.coverUrl,
        status: input.status,
      },
    })
    // Handle product link change
    if (input.productId !== undefined) {
      // Unlink existing product first kalau ada
      if (existing.product && existing.product.id !== input.productId) {
        await tx.product.update({
          where: { id: existing.product.id },
          data: { courseId: null },
        })
      }
      if (input.productId) {
        await tx.product.update({
          where: { id: input.productId },
          data: { courseId: courseId },
        })
      }
    }
    return c
  })
}

export async function deleteCourse(userId: string, courseId: string) {
  // Cascade delete modules+lessons. Enrollment di-cascade juga, tapi
  // LessonProgress sudah ikut via Enrollment cascade.
  // Product.courseId di-set null otomatis (FK SetNull).
  const course = await prisma.course.findFirst({
    where: { id: courseId, userId },
    select: { id: true },
  })
  if (!course) throw new Error('Course tidak ditemukan')
  await prisma.course.delete({ where: { id: courseId } })
}

// ─────────────────────────────────────────
// Module CRUD
// ─────────────────────────────────────────

export async function createModule(
  userId: string,
  courseId: string,
  title: string,
) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, userId },
    select: { id: true },
  })
  if (!course) throw new Error('Course tidak ditemukan')

  // sortOrder = max + 1 supaya append di akhir.
  const last = await prisma.courseModule.findFirst({
    where: { courseId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })
  return prisma.courseModule.create({
    data: {
      courseId,
      title,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  })
}

export async function updateModule(
  userId: string,
  moduleId: string,
  input: { title?: string; sortOrder?: number },
) {
  // Cek ownership lewat course→user
  const mod = await prisma.courseModule.findFirst({
    where: { id: moduleId, course: { userId } },
    select: { id: true },
  })
  if (!mod) throw new Error('Module tidak ditemukan')
  return prisma.courseModule.update({
    where: { id: moduleId },
    data: { title: input.title, sortOrder: input.sortOrder },
  })
}

export async function deleteModule(userId: string, moduleId: string) {
  const mod = await prisma.courseModule.findFirst({
    where: { id: moduleId, course: { userId } },
    select: { id: true, courseId: true },
  })
  if (!mod) throw new Error('Module tidak ditemukan')
  await prisma.courseModule.delete({ where: { id: moduleId } })
  // Recompute totalDurationSec course (lessons di-cascade ke null durasi)
  await recomputeCourseDuration(mod.courseId)
}

// ─────────────────────────────────────────
// Lesson CRUD
// ─────────────────────────────────────────

export interface CreateLessonInput {
  title: string
  contentType?: LessonContentType
  videoEmbedUrl?: string | null
  richTextHtml?: string | null
  durationSec?: number
  isFreePreview?: boolean
  // Phase 4 — drip schedule. Plan PRO/UNLIMITED only; service throw
  // kalau plan user tidak support.
  dripDays?: number | null
}

export async function createLesson(
  userId: string,
  moduleId: string,
  input: CreateLessonInput,
) {
  // Cek ownership + ambil courseId untuk quota check + recompute duration
  const mod = await prisma.courseModule.findFirst({
    where: { id: moduleId, course: { userId } },
    select: { id: true, courseId: true },
  })
  if (!mod) throw new Error('Module tidak ditemukan')

  // Quota check via LmsQuota — max lesson per course.
  const quota = await getActiveLmsQuota(userId)
  if (!isUnlimited(quota.maxLessonsPerCourse)) {
    const lessonCount = await prisma.lesson.count({
      where: { module: { courseId: mod.courseId } },
    })
    checkLimitOrThrow(
      lessonCount,
      quota.maxLessonsPerCourse,
      `lesson per course (${quota.tier})`,
    )
  }

  // Phase 4 — drip validation: kalau dripDays > 0 (set explicit), cek plan
  // canUseDripSchedule. quota sudah di-resolve di atas untuk maxLessons.
  if (input.dripDays && input.dripDays > 0) {
    if (!quota.canUseDripSchedule) {
      const err = new Error(
        `Drip schedule butuh plan PRO/UNLIMITED. Tier kamu: ${quota.tier}.`,
      )
      ;(err as Error & { code?: string }).code = 'LMS_PLAN_FEATURE_LOCKED'
      throw err
    }
  }

  const last = await prisma.lesson.findFirst({
    where: { moduleId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })
  const lesson = await prisma.lesson.create({
    data: {
      moduleId,
      title: input.title,
      contentType: input.contentType ?? 'VIDEO_EMBED',
      videoEmbedUrl: input.videoEmbedUrl ?? null,
      richTextHtml: input.richTextHtml ?? null,
      durationSec: input.durationSec ?? 0,
      isFreePreview: input.isFreePreview ?? false,
      dripDays: input.dripDays ?? null,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  })
  await recomputeCourseDuration(mod.courseId)
  return lesson
}

export async function updateLesson(
  userId: string,
  lessonId: string,
  input: Partial<CreateLessonInput> & { sortOrder?: number },
) {
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, module: { course: { userId } } },
    include: { module: { select: { courseId: true } } },
  })
  if (!lesson) throw new Error('Lesson tidak ditemukan')

  // Phase 4 — drip validation kalau user set dripDays > 0.
  if (input.dripDays && input.dripDays > 0) {
    const quota = await getActiveLmsQuota(userId)
    if (!quota.canUseDripSchedule) {
      const err = new Error(
        `Drip schedule butuh plan PRO/UNLIMITED. Tier kamu: ${quota.tier}.`,
      )
      ;(err as Error & { code?: string }).code = 'LMS_PLAN_FEATURE_LOCKED'
      throw err
    }
  }

  const updated = await prisma.lesson.update({
    where: { id: lessonId },
    data: {
      title: input.title,
      contentType: input.contentType,
      videoEmbedUrl: input.videoEmbedUrl,
      richTextHtml: input.richTextHtml,
      durationSec: input.durationSec,
      isFreePreview: input.isFreePreview,
      dripDays: input.dripDays,
      sortOrder: input.sortOrder,
    },
  })
  await recomputeCourseDuration(lesson.module.courseId)
  return updated
}

export async function deleteLesson(userId: string, lessonId: string) {
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, module: { course: { userId } } },
    include: { module: { select: { courseId: true } } },
  })
  if (!lesson) throw new Error('Lesson tidak ditemukan')
  await prisma.lesson.delete({ where: { id: lessonId } })
  await recomputeCourseDuration(lesson.module.courseId)
}

// Recompute totalDurationSec — sum all lessons di semua modules course.
// Dipanggil setelah lesson create/update/delete untuk denormalisasi.
async function recomputeCourseDuration(courseId: string) {
  const agg = await prisma.lesson.aggregate({
    where: { module: { courseId } },
    _sum: { durationSec: true },
  })
  await prisma.course.update({
    where: { id: courseId },
    data: { totalDurationSec: agg._sum.durationSec ?? 0 },
  })
}

// ─────────────────────────────────────────
// Publish
// ─────────────────────────────────────────

export async function publishCourse(userId: string, courseId: string) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, userId },
    include: {
      modules: { include: { lessons: { select: { id: true } } } },
      product: { select: { id: true } },
    },
  })
  if (!course) throw new Error('Course tidak ditemukan')

  const lessonCount = course.modules.reduce(
    (acc, m) => acc + m.lessons.length,
    0,
  )
  if (lessonCount === 0) {
    throw new Error('Course harus punya minimal 1 lesson sebelum di-publish')
  }
  if (!course.product) {
    throw new Error(
      'Link course ke produk dulu sebelum publish — supaya customer bisa beli',
    )
  }

  return prisma.course.update({
    where: { id: courseId },
    data: { status: 'PUBLISHED' },
  })
}
