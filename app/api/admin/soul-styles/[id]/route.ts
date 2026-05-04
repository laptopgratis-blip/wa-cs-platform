// PATCH  /api/admin/soul-styles/[id] — edit sebagian field
// DELETE /api/admin/soul-styles/[id] — hapus permanen
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { soulOptionUpdateSchema } from '@/lib/validations/admin'

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
  const parsed = soulOptionUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  try {
    const updated = await prisma.soulStyle.update({
      where: { id },
      data: parsed.data,
    })
    return jsonOk(updated)
  } catch (err) {
    console.error(
      '[PATCH /api/admin/soul-styles/:id] gagal:',
      err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : err,
    )
    return jsonError(
      err instanceof Error ? `Server error: ${err.message}` : 'Terjadi kesalahan server',
      500,
    )
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
    await prisma.soulStyle.delete({ where: { id } })
    return jsonOk({ deleted: true })
  } catch (err) {
    console.error(
      '[DELETE /api/admin/soul-styles/:id] gagal:',
      err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : err,
    )
    return jsonError(
      err instanceof Error ? `Server error: ${err.message}` : 'Terjadi kesalahan server',
      500,
    )
  }
}
