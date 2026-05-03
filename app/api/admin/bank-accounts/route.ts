// GET  /api/admin/bank-accounts — list semua rekening
// POST /api/admin/bank-accounts — tambah rekening baru
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { bankAccountCreateSchema } from '@/lib/validations/admin'

export async function GET() {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const rows = await prisma.bankAccount.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    })
    return jsonOk(rows)
  } catch (err) {
    console.error('[GET /api/admin/bank-accounts] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const parsed = bankAccountCreateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  try {
    const created = await prisma.bankAccount.create({ data: parsed.data })
    return jsonOk(created, 201)
  } catch (err) {
    console.error('[POST /api/admin/bank-accounts] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
