// PATCH /api/orders/[id]/notes-admin — update catatan internal admin saja.
// Pakai endpoint terpisah (bukan PATCH /api/orders/[id]) supaya inline-edit
// di tabel ringan & tidak butuh kirim payload state lain.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'

const bodySchema = z.object({
  notesAdmin: z.string().max(2000).nullable(),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  const json = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }
  const order = await prisma.userOrder.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  })
  if (!order) return jsonError('Pesanan tidak ditemukan', 404)

  const value = parsed.data.notesAdmin?.trim() ?? null
  await prisma.userOrder.update({
    where: { id },
    data: { notesAdmin: value && value.length > 0 ? value : null },
  })
  return jsonOk({ notesAdmin: value && value.length > 0 ? value : null })
}
