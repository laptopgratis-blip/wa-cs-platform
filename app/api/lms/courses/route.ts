// GET    /api/lms/courses        — list course milik user
// POST   /api/lms/courses        — bikin course baru (DRAFT)
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { createCourse, listCoursesForOwner } from '@/lib/services/lms/course'

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const courses = await listCoursesForOwner(session.user.id)
  return jsonOk({ courses })
}

const createSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional().nullable(),
  coverUrl: z.string().url().optional().nullable(),
  productId: z.string().min(1).optional().nullable(),
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
  try {
    const course = await createCourse({
      userId: session.user.id,
      ...parsed.data,
    })
    return jsonOk({ course })
  } catch (err) {
    const code = (err as Error & { code?: string }).code
    if (code === 'LMS_COURSE_QUOTA') {
      return Response.json(
        {
          success: false,
          error: 'LMS_COURSE_QUOTA',
          message: (err as Error).message,
        },
        { status: 402 },
      )
    }
    const msg = err instanceof Error ? err.message : 'Gagal bikin course'
    return jsonError(msg, 400)
  }
}
