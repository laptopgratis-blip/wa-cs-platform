// POST /api/lms/courses/[courseId]/publish — set status PUBLISHED.
// Validate: minimal 1 lesson + linked Product.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { publishCourse } from '@/lib/services/lms/course'

interface Params {
  params: Promise<{ courseId: string }>
}

export async function POST(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { courseId } = await params
  try {
    const course = await publishCourse(session.user.id, courseId)
    return jsonOk({ course })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Gagal publish', 400)
  }
}
