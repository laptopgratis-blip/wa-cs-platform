// PATCH /api/reviews/[id]  — { approved: boolean } (kurasi testimoni)
// DELETE /api/reviews/[id] — hapus testimoni
// Owner only (POWER). Scope ke userId supaya tak bisa ubah milik user lain.
import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'

const patchSchema = z.object({ approved: z.boolean() })

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { session } = await requireOrderSystemAccess()
    const { id } = await params
    const parsed = patchSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return jsonError('Body tidak valid', 400)

    const existing = await prisma.orderReview.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    })
    if (!existing) return jsonError('Testimoni tidak ditemukan', 404)

    const updated = await prisma.orderReview.update({
      where: { id },
      data: { approved: parsed.data.approved },
    })
    return jsonOk({ review: updated })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[reviews PATCH]', e)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { session } = await requireOrderSystemAccess()
    const { id } = await params

    const existing = await prisma.orderReview.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    })
    if (!existing) return jsonError('Testimoni tidak ditemukan', 404)

    await prisma.orderReview.delete({ where: { id } })
    return jsonOk({ deleted: true })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[reviews DELETE]', e)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
