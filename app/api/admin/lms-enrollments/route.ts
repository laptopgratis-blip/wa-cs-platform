// GET  /api/admin/lms-enrollments?phone=&invoice=&status=&take=&skip=
//   List enrollments dgn filter — admin lihat SEMUA user; non-admin lihat
//   hanya enrollment ke course miliknya.
// POST /api/admin/lms-enrollments
//   Manual add enrollment. Body: { courseId, studentPhone, studentName?,
//   studentEmail?, expiresAt? }. Phone di-normalisasi sebelum upsert.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import {
  searchEnrollments,
  upsertEnrollment,
} from '@/lib/services/lms/enrollment'

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 10) return null
  if (digits.startsWith('62')) return digits
  if (digits.startsWith('0')) return `62${digits.slice(1)}`
  return `62${digits}`
}

export async function GET(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const url = new URL(req.url)
  const phoneRaw = url.searchParams.get('phone')?.trim() || undefined
  const phone = phoneRaw ? (normalizePhone(phoneRaw) ?? phoneRaw) : undefined
  const invoice = url.searchParams.get('invoice')?.trim() || undefined
  const statusRaw = url.searchParams.get('status')?.toUpperCase()
  const status =
    statusRaw === 'ACTIVE' || statusRaw === 'REVOKED' || statusRaw === 'EXPIRED'
      ? statusRaw
      : null
  const take = Math.min(Number(url.searchParams.get('take') ?? 50), 100)
  const skip = Math.max(Number(url.searchParams.get('skip') ?? 0), 0)

  // Non-admin scope ke courses miliknya saja.
  const userId =
    session.user.role === 'ADMIN' ? undefined : session.user.id

  const enrollments = await searchEnrollments({
    userId,
    phone,
    invoiceNumber: invoice,
    status,
    take,
    skip,
  })
  return jsonOk({ enrollments })
}

const createSchema = z.object({
  courseId: z.string().min(1),
  studentPhone: z.string().min(8),
  studentName: z.string().max(100).optional().nullable(),
  studentEmail: z.string().email().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
})

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }

  // Cek ownership / admin
  const course = await prisma.course.findUnique({
    where: { id: parsed.data.courseId },
    select: { id: true, userId: true },
  })
  if (!course) return jsonError('Course tidak ditemukan', 404)
  if (session.user.role !== 'ADMIN' && course.userId !== session.user.id) {
    return jsonError('Bukan course milik kamu', 403)
  }

  const phone = normalizePhone(parsed.data.studentPhone)
  if (!phone) return jsonError('Nomor WA tidak valid', 400)

  const enrollment = await upsertEnrollment({
    courseId: parsed.data.courseId,
    studentPhone: phone,
    studentName: parsed.data.studentName,
    studentEmail: parsed.data.studentEmail,
  })

  // Update expiresAt kalau dikasih
  if (parsed.data.expiresAt) {
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { expiresAt: new Date(parsed.data.expiresAt) },
    })
  }

  return jsonOk({ enrollment })
}
