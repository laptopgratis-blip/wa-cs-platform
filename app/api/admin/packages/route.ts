// GET  /api/admin/packages
// POST /api/admin/packages
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { tokenPackageCreateSchema } from '@/lib/validations/admin'

export async function GET() {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const rows = await prisma.tokenPackage.findMany({
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }],
    })
    return jsonOk(rows)
  } catch (err) {
    console.error('[GET /api/admin/packages] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const parsed = tokenPackageCreateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  try {
    const created = await prisma.tokenPackage.create({ data: parsed.data })
    return jsonOk(created, 201)
  } catch (err) {
    console.error('[POST /api/admin/packages] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
