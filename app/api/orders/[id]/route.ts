// GET    /api/orders/[id]  — detail + history pesan dari kontak (last 20).
// PATCH  /api/orders/[id]  — update status / notes / tracking / customer info.
// DELETE /api/orders/[id]  — hapus pesanan.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { orderUpdateSchema } from '@/lib/validations/order'

interface Params {
  params: Promise<{ id: string }>
}

async function ownedOrder(userId: string, id: string) {
  return prisma.userOrder.findFirst({
    where: { id, userId },
  })
}

export async function GET(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  const order = await ownedOrder(session.user.id, id)
  if (!order) return jsonError('Pesanan tidak ditemukan', 404)

  // Ambil 20 pesan terakhir dari kontak ini supaya admin bisa cek konteks
  // tanpa pindah ke /inbox. Hanya field essential.
  const messages = await prisma.message.findMany({
    where: { contactId: order.contactId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      content: true,
      role: true,
      createdAt: true,
    },
  })

  return jsonOk({
    ...order,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    messages: messages
      .map((m) => ({
        id: m.id,
        content: m.content,
        role: m.role,
        createdAt: m.createdAt.toISOString(),
      }))
      .reverse(), // tampilkan urutan kronologis
  })
}

export async function PATCH(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  const existing = await ownedOrder(session.user.id, id)
  if (!existing) return jsonError('Pesanan tidak ditemukan', 404)

  const json = await req.json().catch(() => null)
  const parsed = orderUpdateSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }

  try {
    const data = parsed.data
    const updated = await prisma.userOrder.update({
      where: { id },
      data: {
        ...(data.customerName !== undefined
          ? { customerName: data.customerName }
          : {}),
        ...(data.customerPhone !== undefined
          ? { customerPhone: data.customerPhone }
          : {}),
        ...(data.customerAddress !== undefined
          ? { customerAddress: data.customerAddress }
          : {}),
        ...(data.items !== undefined ? { items: data.items } : {}),
        ...(data.totalAmount !== undefined
          ? { totalAmount: data.totalAmount }
          : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.paymentMethod !== undefined
          ? { paymentMethod: data.paymentMethod }
          : {}),
        ...(data.paymentStatus !== undefined
          ? { paymentStatus: data.paymentStatus }
          : {}),
        ...(data.paymentProofUrl !== undefined
          ? { paymentProofUrl: data.paymentProofUrl }
          : {}),
        ...(data.deliveryStatus !== undefined
          ? { deliveryStatus: data.deliveryStatus }
          : {}),
        ...(data.trackingNumber !== undefined
          ? { trackingNumber: data.trackingNumber }
          : {}),
      },
    })
    return jsonOk({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    })
  } catch (err) {
    console.error('[PATCH /api/orders/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  const existing = await ownedOrder(session.user.id, id)
  if (!existing) return jsonError('Pesanan tidak ditemukan', 404)
  try {
    await prisma.userOrder.delete({ where: { id } })
    return jsonOk({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/orders/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
