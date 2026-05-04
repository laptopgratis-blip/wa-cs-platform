// GET  /api/admin/soul-styles — list semua gaya balas (admin only)
// POST /api/admin/soul-styles — tambah baru (admin only)
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { soulOptionCreateSchema } from '@/lib/validations/admin'

export async function GET() {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const rows = await prisma.soulStyle.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    })
    return jsonOk(rows)
  } catch (err) {
    console.error(
      '[GET /api/admin/soul-styles] gagal:',
      err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : err,
    )
    return jsonError(
      err instanceof Error ? `Server error: ${err.message}` : 'Terjadi kesalahan server',
      500,
    )
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const parsed = soulOptionCreateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  try {
    const created = await prisma.soulStyle.create({ data: parsed.data })
    return jsonOk(created, 201)
  } catch (err) {
    console.error(
      '[POST /api/admin/soul-styles] gagal:',
      err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : err,
    )
    return jsonError(
      err instanceof Error ? `Server error: ${err.message}` : 'Terjadi kesalahan server',
      500,
    )
  }
}
