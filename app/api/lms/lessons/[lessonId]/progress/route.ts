// POST /api/lms/lessons/[lessonId]/progress
// Body: { watchedSec: number, completed?: boolean }
// Auth via student session cookie. Service cek enrollment ACTIVE +
// upsert LessonProgress.
import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api'
import {
  STUDENT_COOKIE_NAME,
  getStudentFromSessionToken,
} from '@/lib/services/lms/student-auth'
import { updateLessonProgress } from '@/lib/services/lms/student-portal'

interface Params {
  params: Promise<{ lessonId: string }>
}

const schema = z.object({
  watchedSec: z.number().int().min(0).max(86_400),
  completed: z.boolean().optional(),
})

export async function POST(req: Request, { params }: Params) {
  const cookieHeader = req.headers.get('cookie') ?? ''
  const match = cookieHeader.match(
    new RegExp(`(?:^|; )${STUDENT_COOKIE_NAME}=([^;]+)`),
  )
  const ctx = match?.[1]
    ? await getStudentFromSessionToken(match[1])
    : null
  if (!ctx) return jsonError('unauthorized', 401)

  const { lessonId } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError('Body tidak valid')

  try {
    const progress = await updateLessonProgress({
      studentPhone: ctx.studentPhone,
      lessonId,
      watchedSec: parsed.data.watchedSec,
      completed: parsed.data.completed,
    })
    return jsonOk({ progress })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Gagal', 400)
  }
}
