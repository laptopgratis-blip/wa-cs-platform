// GET  /api/admin/lp-packages — list semua paket upgrade LP
// POST /api/admin/lp-packages — tambah paket baru
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { lpUpgradePackageCreateSchema } from '@/lib/validations/admin'

export async function GET() {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const rows = await prisma.lpUpgradePackage.findMany({
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }],
    })
    return jsonOk(rows)
  } catch (err) {
    console.error('[GET /api/admin/lp-packages] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const parsed = lpUpgradePackageCreateSchema.safeParse(
    await req.json().catch(() => null),
  )
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  try {
    const created = await prisma.lpUpgradePackage.create({ data: parsed.data })
    return jsonOk(created, 201)
  } catch (err) {
    console.error('[POST /api/admin/lp-packages] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
