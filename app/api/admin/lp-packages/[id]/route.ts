// PATCH  /api/admin/lp-packages/[id]
// DELETE /api/admin/lp-packages/[id]
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { lpUpgradePackageUpdateSchema } from '@/lib/validations/admin'

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
  const parsed = lpUpgradePackageUpdateSchema.safeParse(
    await req.json().catch(() => null),
  )
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  try {
    const updated = await prisma.lpUpgradePackage.update({
      where: { id },
      data: parsed.data,
    })
    return jsonOk(updated)
  } catch (err) {
    console.error('[PATCH /api/admin/lp-packages/:id] gagal:', err)
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
    // Cek dulu apakah ada Payment / ManualPayment yang refer paket ini —
    // kalau ada, lebih baik nonaktifkan saja daripada hapus (audit trail).
    const refs = await prisma.payment.count({ where: { lpPackageId: id } })
    const manualRefs = await prisma.manualPayment.count({
      where: { lpPackageId: id },
    })
    if (refs + manualRefs > 0) {
      return jsonError(
        `Tidak bisa hapus — ada ${refs + manualRefs} pembelian terkait. Nonaktifkan saja.`,
        409,
      )
    }
    await prisma.lpUpgradePackage.delete({ where: { id } })
    return jsonOk({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/admin/lp-packages/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
