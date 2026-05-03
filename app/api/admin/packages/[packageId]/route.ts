// PATCH  /api/admin/packages/[packageId]
// DELETE /api/admin/packages/[packageId]
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { tokenPackageUpdateSchema } from '@/lib/validations/admin'

interface Params {
  params: Promise<{ packageId: string }>
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const { packageId } = await params
  const parsed = tokenPackageUpdateSchema.safeParse(
    await req.json().catch(() => null),
  )
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  try {
    const updated = await prisma.tokenPackage.update({
      where: { id: packageId },
      data: parsed.data,
    })
    return jsonOk(updated)
  } catch (err) {
    console.error('[PATCH /api/admin/packages/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const { packageId } = await params
  try {
    await prisma.tokenPackage.delete({ where: { id: packageId } })
    return jsonOk({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/admin/packages/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
