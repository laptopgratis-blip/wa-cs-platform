// LMS Certificate — issue + verify sertifikat completion.
//
// Issue eligibility:
//   - Enrollment ACTIVE
//   - Course PUBLISHED
//   - Course owner punya quota.canIssueCertificate=true (PRO/UNLIMITED)
//   - Semua lesson di course punya LessonProgress.completedAt != null
//   - Belum pernah issued (1:1 enrollment ↔ certificate)
//
// Number generation:
//   "HULAO-LMS-YYYY-XXXXXX" — YYYY = tahun, XXXXXX = base32 random 6 char.
//   Collision-resistant per tahun (32^6 ≈ 1B kombinasi).
import crypto from 'node:crypto'

import { prisma } from '@/lib/prisma'

import { getActiveLmsQuota } from './quota'

const CERT_PREFIX = 'HULAO-LMS'

function generateCertificateNumber(): string {
  // base32 (Crockford-style, no confusing chars). Lowercase → upper.
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  let suffix = ''
  for (let i = 0; i < 6; i++) {
    const idx = crypto.randomInt(0, alphabet.length)
    suffix += alphabet[idx]
  }
  const year = new Date().getFullYear()
  return `${CERT_PREFIX}-${year}-${suffix}`
}

export class CertificateError extends Error {
  constructor(
    message: string,
    public code:
      | 'NOT_ENROLLED'
      | 'COURSE_NOT_PUBLISHED'
      | 'PLAN_NOT_SUPPORTED'
      | 'NOT_COMPLETED'
      | 'ALREADY_ISSUED',
  ) {
    super(message)
  }
}

export interface IssueCertificateInput {
  studentPhone: string
  courseSlug: string
}

// Issue cert kalau eligible. Kalau sudah issued, return existing (idempotent).
export async function issueCertificateIfEligible(
  input: IssueCertificateInput,
) {
  // Resolve course + enrollment
  const course = await prisma.course.findFirst({
    where: { slug: input.courseSlug, status: 'PUBLISHED' },
    include: {
      user: { select: { id: true, name: true, email: true } },
      modules: {
        include: { lessons: { select: { id: true } } },
      },
    },
  })
  if (!course) throw new CertificateError('Course tidak ditemukan / tidak published', 'COURSE_NOT_PUBLISHED')

  const enrollment = await prisma.enrollment.findUnique({
    where: {
      courseId_studentPhone: {
        courseId: course.id,
        studentPhone: input.studentPhone,
      },
    },
    include: { certificate: true },
  })
  if (!enrollment || enrollment.status !== 'ACTIVE') {
    throw new CertificateError('Bukan student aktif course ini', 'NOT_ENROLLED')
  }

  // Idempotent — kalau sudah issued, return existing
  if (enrollment.certificate) return enrollment.certificate

  // Cek plan owner support certificate
  const ownerQuota = await getActiveLmsQuota(course.userId)
  if (!ownerQuota.canIssueCertificate) {
    throw new CertificateError(
      'Penjual belum upgrade plan LMS untuk fitur sertifikat',
      'PLAN_NOT_SUPPORTED',
    )
  }

  // Cek semua lesson completed
  const allLessonIds = course.modules.flatMap((m) =>
    m.lessons.map((l) => l.id),
  )
  if (allLessonIds.length === 0) {
    throw new CertificateError(
      'Course belum punya lesson',
      'NOT_COMPLETED',
    )
  }
  const completedCount = await prisma.lessonProgress.count({
    where: {
      enrollmentId: enrollment.id,
      lessonId: { in: allLessonIds },
      completedAt: { not: null },
    },
  })
  if (completedCount < allLessonIds.length) {
    throw new CertificateError(
      `Belum semua lesson selesai (${completedCount}/${allLessonIds.length})`,
      'NOT_COMPLETED',
    )
  }

  // Issue — generate number unique. Loop kalau collision (extremely rare).
  let number = generateCertificateNumber()
  for (let attempt = 0; attempt < 5; attempt++) {
    const exists = await prisma.certificate.findUnique({
      where: { number },
      select: { id: true },
    })
    if (!exists) break
    number = generateCertificateNumber()
  }

  const cert = await prisma.certificate.create({
    data: {
      number,
      enrollmentId: enrollment.id,
      studentName:
        enrollment.studentName ?? input.studentPhone, // fallback ke phone
      studentPhone: input.studentPhone,
      courseTitle: course.title,
      courseSlug: course.slug,
      issuerUserId: course.userId,
      issuerName: course.user.name ?? course.user.email,
    },
  })
  return cert
}

// Verify by number — public, no auth. Dipakai di /belajar/certificate/[number].
export async function getCertificateByNumber(number: string) {
  return prisma.certificate.findUnique({
    where: { number },
    select: {
      number: true,
      studentName: true,
      courseTitle: true,
      courseSlug: true,
      issuerName: true,
      issuedAt: true,
    },
  })
}

// List cert milik student (untuk dashboard /belajar).
export async function getStudentCertificates(studentPhone: string) {
  return prisma.certificate.findMany({
    where: { studentPhone },
    select: {
      number: true,
      courseTitle: true,
      courseSlug: true,
      issuerName: true,
      issuedAt: true,
    },
    orderBy: { issuedAt: 'desc' },
  })
}
