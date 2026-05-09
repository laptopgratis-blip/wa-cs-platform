// PATCH  /api/admin/lms-enrollments/[id]  — revoke / reactivate
// DELETE /api/admin/lms-enrollments/[id]  — hard delete (jarang; default revoke)
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import {
  reactivateEnrollment,
  revokeEnrollment,
} from '@/lib/services/lms/enrollment'

interface Params {
  params: Promise<{ enrollmentId: string }>
}

const schema = z.object({
  action: z.enum(['revoke', 'reactivate']),
  reason: z.string().max(500).optional(),
  newExpiresAt: z.string().datetime().optional().nullable(),
})

export async function PATCH(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { enrollmentId } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError('Body tidak valid')

  // Cek ownership
  const existing = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: { course: { select: { userId: true } } },
  })
  if (!existing) return jsonError('Enrollment tidak ditemukan', 404)
  if (
    session.user.role !== 'ADMIN' &&
    existing.course.userId !== session.user.id
  ) {
    return jsonError('Bukan enrollment course kamu', 403)
  }

  if (parsed.data.action === 'revoke') {
    const reason = parsed.data.reason ?? 'Manual revoke admin'
    const e = await revokeEnrollment(enrollmentId, reason)
    return jsonOk({ enrollment: e })
  }
  // reactivate
  const newExp = parsed.data.newExpiresAt
    ? new Date(parsed.data.newExpiresAt)
    : null
  const e = await reactivateEnrollment(enrollmentId, newExp)
  return jsonOk({ enrollment: e })
}

export async function DELETE(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { enrollmentId } = await params

  const existing = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: { course: { select: { userId: true } } },
  })
  if (!existing) return jsonError('Enrollment tidak ditemukan', 404)
  if (
    session.user.role !== 'ADMIN' &&
    existing.course.userId !== session.user.id
  ) {
    return jsonError('Bukan enrollment course kamu', 403)
  }

  await prisma.enrollment.delete({ where: { id: enrollmentId } })
  return jsonOk({ ok: true })
}
