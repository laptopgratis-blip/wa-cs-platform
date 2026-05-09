// LMS Enrollment service — upsert akses student per course.
//
// Dipakai oleh:
//   1. Auto hook dari order PAID (lib/services/lms/order-hook.ts)
//   2. Admin manual add via /api/admin/lms-enrollments
//
// Idempotent — kalau (courseId, studentPhone) sudah ada, update status ke
// ACTIVE supaya re-order tidak duplikat. Phone di-normalisasi ke E.164
// sebelum upsert (lib/phone-normalize sudah ada di codebase).
import { prisma } from '@/lib/prisma'

export interface UpsertEnrollmentInput {
  courseId: string
  studentPhone: string // sudah ter-normalisasi sebelum dipanggil
  studentName?: string | null
  studentEmail?: string | null
  orderId?: string | null
  invoiceNumber?: string | null
}

export async function upsertEnrollment(input: UpsertEnrollmentInput) {
  return prisma.enrollment.upsert({
    where: {
      courseId_studentPhone: {
        courseId: input.courseId,
        studentPhone: input.studentPhone,
      },
    },
    create: {
      courseId: input.courseId,
      studentPhone: input.studentPhone,
      studentName: input.studentName ?? null,
      studentEmail: input.studentEmail ?? null,
      orderId: input.orderId ?? null,
      invoiceNumber: input.invoiceNumber ?? null,
      status: 'ACTIVE',
    },
    update: {
      // Re-order → reset ke ACTIVE (kalau sebelumnya REVOKED/EXPIRED, akses
      // di-restore). Update nama/email kalau order baru kasih info lebih
      // lengkap. orderId di-update ke order paling baru untuk traceability.
      status: 'ACTIVE',
      revokedAt: null,
      revokeReason: null,
      studentName: input.studentName ?? undefined,
      studentEmail: input.studentEmail ?? undefined,
      orderId: input.orderId ?? undefined,
      invoiceNumber: input.invoiceNumber ?? undefined,
    },
  })
}

// Revoke — admin action (refund, fraud, dll). Soft delete: tetap simpan
// row untuk audit, tapi student tidak bisa akses portal Phase 2.
export async function revokeEnrollment(
  enrollmentId: string,
  reason: string,
) {
  return prisma.enrollment.update({
    where: { id: enrollmentId },
    data: {
      status: 'REVOKED',
      revokedAt: new Date(),
      revokeReason: reason.slice(0, 500),
    },
  })
}

// Re-activate — undo revoke. Kalau expired karena expiresAt lewat, admin
// extend dgn set ulang expiresAt + status ACTIVE.
export async function reactivateEnrollment(
  enrollmentId: string,
  newExpiresAt?: Date | null,
) {
  return prisma.enrollment.update({
    where: { id: enrollmentId },
    data: {
      status: 'ACTIVE',
      revokedAt: null,
      revokeReason: null,
      expiresAt: newExpiresAt ?? undefined,
    },
  })
}

// Admin search — by phone or order invoiceNumber. Limit 50 untuk paging.
export async function searchEnrollments(input: {
  userId?: string // filter by course owner (null = admin lihat semua)
  phone?: string
  invoiceNumber?: string
  status?: 'ACTIVE' | 'REVOKED' | 'EXPIRED' | null
  take?: number
  skip?: number
}) {
  return prisma.enrollment.findMany({
    where: {
      ...(input.userId && { course: { userId: input.userId } }),
      ...(input.phone && { studentPhone: { contains: input.phone } }),
      ...(input.invoiceNumber && {
        invoiceNumber: { contains: input.invoiceNumber },
      }),
      ...(input.status && { status: input.status }),
    },
    include: {
      course: {
        select: { id: true, title: true, slug: true, userId: true },
      },
    },
    orderBy: { enrolledAt: 'desc' },
    take: Math.min(input.take ?? 50, 100),
    skip: input.skip ?? 0,
  })
}
