// PATCH  /api/order-forms/[id] — edit form.
// DELETE /api/order-forms/[id] — hapus form (soft via cascade pada Product.userId).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import { orderFormUpdateSchema } from '@/lib/validations/order-form'

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
  const parsed = orderFormUpdateSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }
  try {
    const existing = await prisma.orderForm.findFirst({
      where: { id, userId: session.user.id },
    })
    if (!existing) return jsonError('Form tidak ditemukan', 404)

    const data = parsed.data
    const updated = await prisma.orderForm.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.productIds !== undefined && { productIds: data.productIds }),
        ...(data.acceptCod !== undefined && { acceptCod: data.acceptCod }),
        ...(data.acceptTransfer !== undefined && {
          acceptTransfer: data.acceptTransfer,
        }),
        ...(data.shippingFlatCod !== undefined && {
          shippingFlatCod: data.shippingFlatCod,
        }),
        ...(data.showFlashSaleCounter !== undefined && {
          showFlashSaleCounter: data.showFlashSaleCounter,
        }),
        ...(data.showShippingPromo !== undefined && {
          showShippingPromo: data.showShippingPromo,
        }),
        ...(data.enabledPixelIds !== undefined && {
          enabledPixelIds: data.enabledPixelIds,
        }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    })
    return jsonOk({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    })
  } catch (err) {
    console.error('[PATCH /api/order-forms/[id]] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  try {
    const existing = await prisma.orderForm.findFirst({
      where: { id, userId: session.user.id },
    })
    if (!existing) return jsonError('Form tidak ditemukan', 404)
    await prisma.orderForm.delete({ where: { id } })
    return jsonOk({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/order-forms/[id]] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
