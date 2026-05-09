// GET    /api/lms/courses/[courseId]   — detail course + modules + lessons
// PATCH  /api/lms/courses/[courseId]   — update course (title, status, dll)
// DELETE /api/lms/courses/[courseId]   — hapus course (cascade modules+lessons+enrollments)
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import {
  deleteCourse,
  getCourseForOwner,
  updateCourse,
} from '@/lib/services/lms/course'

interface Params {
  params: Promise<{ courseId: string }>
}

export async function GET(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { courseId } = await params
  const course = await getCourseForOwner(session.user.id, courseId)
  if (!course) return jsonError('Course tidak ditemukan', 404)
  return jsonOk({ course })
}

const updateSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  coverUrl: z.string().url().optional().nullable(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  productId: z.string().min(1).optional().nullable(),
})

export async function PATCH(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { courseId } = await params
  const parsed = updateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  try {
    const course = await updateCourse(session.user.id, courseId, parsed.data)
    return jsonOk({ course })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Gagal update', 400)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { courseId } = await params
  try {
    await deleteCourse(session.user.id, courseId)
    return jsonOk({ ok: true })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Gagal hapus', 400)
  }
}
