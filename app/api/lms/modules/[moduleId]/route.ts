// PATCH  /api/lms/modules/[moduleId]  — rename + sortOrder
// DELETE /api/lms/modules/[moduleId]  — hapus module + cascade lessons
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { deleteModule, updateModule } from '@/lib/services/lms/course'

interface Params {
  params: Promise<{ moduleId: string }>
}

const schema = z.object({
  title: z.string().min(1).max(200).optional(),
  sortOrder: z.number().int().min(0).optional(),
})

export async function PATCH(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { moduleId } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError('Body tidak valid')
  try {
    const mod = await updateModule(session.user.id, moduleId, parsed.data)
    return jsonOk({ module: mod })
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
  const { moduleId } = await params
  try {
    await deleteModule(session.user.id, moduleId)
    return jsonOk({ ok: true })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Gagal', 400)
  }
}
