// PATCH  /api/admin/models/[modelId] — update sebagian field
// DELETE /api/admin/models/[modelId] — hapus (kalau tidak dipakai session)
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { aiModelUpdateSchema } from '@/lib/validations/admin'

interface Params {
  params: Promise<{ modelId: string }>
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const { modelId } = await params
  const parsed = aiModelUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  try {
    const updated = await prisma.aiModel.update({
      where: { id: modelId },
      data: parsed.data,
    })
    return jsonOk(updated)
  } catch (err) {
    console.error('[PATCH /api/admin/models/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const { modelId } = await params
  try {
    const used = await prisma.whatsappSession.count({ where: { modelId } })
    if (used > 0) {
      return jsonError(
        `Tidak bisa dihapus — sedang dipakai ${used} WA session. Set isActive=false saja.`,
        409,
      )
    }
    await prisma.aiModel.delete({ where: { id: modelId } })
    return jsonOk({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/admin/models/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
