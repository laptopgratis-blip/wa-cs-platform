// PATCH  /api/admin/bank-accounts/[id]
// DELETE /api/admin/bank-accounts/[id]
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { bankAccountUpdateSchema } from '@/lib/validations/admin'

interface Params {
  params: Promise<{ id: string }>
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  const parsed = bankAccountUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  try {
    const updated = await prisma.bankAccount.update({
      where: { id },
      data: parsed.data,
    })
    return jsonOk(updated)
  } catch (err) {
    console.error('[PATCH /api/admin/bank-accounts/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  try {
    await prisma.bankAccount.delete({ where: { id } })
    return jsonOk({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/admin/bank-accounts/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
