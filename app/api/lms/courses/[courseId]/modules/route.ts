// POST /api/lms/courses/[courseId]/modules — bikin module baru di course.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { createModule } from '@/lib/services/lms/course'

interface Params {
  params: Promise<{ courseId: string }>
}

const schema = z.object({ title: z.string().min(1).max(200) })

export async function POST(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { courseId } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError('title wajib diisi')
  try {
    const mod = await createModule(session.user.id, courseId, parsed.data.title)
    return jsonOk({ module: mod })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Gagal', 400)
  }
}
