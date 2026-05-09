// PATCH  /api/lms/lessons/[lessonId]  — update lesson (semua field)
// DELETE /api/lms/lessons/[lessonId]  — hapus lesson
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { deleteLesson, updateLesson } from '@/lib/services/lms/course'

interface Params {
  params: Promise<{ lessonId: string }>
}

const schema = z.object({
  title: z.string().min(1).max(200).optional(),
  contentType: z.enum(['VIDEO_EMBED', 'TEXT', 'FILE']).optional(),
  videoEmbedUrl: z.string().url().optional().nullable(),
  richTextHtml: z.string().max(50_000).optional().nullable(),
  durationSec: z.number().int().min(0).max(60 * 60 * 12).optional(),
  isFreePreview: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
})

export async function PATCH(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { lessonId } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  try {
    const lesson = await updateLesson(session.user.id, lessonId, parsed.data)
    return jsonOk({ lesson })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Gagal', 400)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { lessonId } = await params
  try {
    await deleteLesson(session.user.id, lessonId)
    return jsonOk({ ok: true })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Gagal', 400)
  }
}
