// GET  /api/admin/models — list semua AI model
// POST /api/admin/models — create
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { aiModelCreateSchema } from '@/lib/validations/admin'

export async function GET() {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const models = await prisma.aiModel.findMany({
      orderBy: [{ isActive: 'desc' }, { costPerMessage: 'asc' }],
      include: { _count: { select: { waSessions: true } } },
    })
    return jsonOk(models)
  } catch (err) {
    console.error('[GET /api/admin/models] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const parsed = aiModelCreateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  try {
    const created = await prisma.aiModel.create({ data: parsed.data })
    return jsonOk(created, 201)
  } catch (err) {
    console.error('[POST /api/admin/models] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
