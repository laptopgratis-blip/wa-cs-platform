// PATCH  /api/admin/soul-personalities/[id] — edit sebagian field
// DELETE /api/admin/soul-personalities/[id] — hapus permanen
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
    const updated = await prisma.soulPersonality.update({
      where: { id },
      data: parsed.data,
    })
    return jsonOk(updated)
  } catch (err) {
    console.error(
      '[PATCH /api/admin/soul-personalities/:id] gagal:',
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
    // Soul.personality menyimpan id sebagai string (bukan FK), jadi tidak ada
    // cascade DB. Hapus saja — Soul yang masih merujuk akan dianggap "tidak
    // ditemukan" oleh resolver dan otomatis fallback ke prompt tanpa kepribadian.
    await prisma.soulPersonality.delete({ where: { id } })
    return jsonOk({ deleted: true })
  } catch (err) {
    console.error(
      '[DELETE /api/admin/soul-personalities/:id] gagal:',
      err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : err,
    )
    return jsonError(
      err instanceof Error ? `Server error: ${err.message}` : 'Terjadi kesalahan server',
      500,
    )
  }
}
