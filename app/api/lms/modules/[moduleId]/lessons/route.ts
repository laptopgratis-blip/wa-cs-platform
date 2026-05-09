// POST /api/lms/modules/[moduleId]/lessons — bikin lesson baru.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { createLesson } from '@/lib/services/lms/course'

interface Params {
  params: Promise<{ moduleId: string }>
}

const schema = z.object({
  title: z.string().min(1).max(200),
  contentType: z.enum(['VIDEO_EMBED', 'TEXT', 'FILE']).optional(),
  videoEmbedUrl: z.string().url().optional().nullable(),
  richTextHtml: z.string().max(50_000).optional().nullable(),
  durationSec: z.number().int().min(0).max(60 * 60 * 12).optional(),
  isFreePreview: z.boolean().optional(),
})

export async function POST(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { moduleId } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  try {
    const lesson = await createLesson(session.user.id, moduleId, parsed.data)
    return jsonOk({ lesson })
  } catch (err) {
    const code = (err as Error & { code?: string }).code
    if (code === 'LMS_LESSON_QUOTA') {
      return Response.json(
        {
          success: false,
          error: 'LMS_LESSON_QUOTA',
          message: (err as Error).message,
        },
        { status: 402 },
      )
    }
    return jsonError(err instanceof Error ? err.message : 'Gagal', 400)
  }
}
