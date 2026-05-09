// GET    /api/orders/[id]  — detail + history pesan dari kontak (last 20).
// PATCH  /api/orders/[id]  — update status / notes / tracking / customer info.
// DELETE /api/orders/[id]  — hapus pesanan.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import {
  cancelQueueForOrder,
  generateQueueForOrder,
  type FollowupEvent,
} from '@/lib/services/followup-engine'
import { triggerEnrollmentForOrderSafe } from '@/lib/services/lms/order-hook'
import { firePixelEventForOrder } from '@/lib/services/pixel-fire'
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
  // tanpa pindah ke /inbox. Hanya field essential. Skip kalau order tidak
  // punya contact (mis. order dari OrderForm publik).
  const messages = order.contactId
    ? await prisma.message.findMany({
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
    : []

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
          ? {
              paymentStatus: data.paymentStatus,
              // Auto-stamp timestamp HANYA saat transisi (status berubah),
              // bukan setiap PATCH dgn status sama. Konsisten dgn gate
              // pixel Purchase di bawah supaya paidAt + pixelPurchaseFiredAt
              // bisa di-correlate (sebelumnya paidAt re-stamp tiap PATCH
              // ubah field lain → terlihat lebih baru dari pixel timestamp).
              ...(data.paymentStatus === 'PAID' &&
                existing.paymentStatus !== 'PAID' && { paidAt: new Date() }),
              ...(data.paymentStatus === 'CANCELLED' &&
                existing.paymentStatus !== 'CANCELLED' && {
                  cancelledAt: new Date(),
                }),
            }
          : {}),
        ...(data.paymentProofUrl !== undefined
          ? { paymentProofUrl: data.paymentProofUrl }
          : {}),
        ...(data.deliveryStatus !== undefined
          ? {
              deliveryStatus: data.deliveryStatus,
              ...(data.deliveryStatus === 'SHIPPED' &&
                existing.deliveryStatus !== 'SHIPPED' && {
                  shippedAt: new Date(),
                }),
              ...(data.deliveryStatus === 'DELIVERED' &&
                existing.deliveryStatus !== 'DELIVERED' && {
                  deliveredAt: new Date(),
                }),
            }
          : {}),
        ...(data.trackingNumber !== undefined
          ? { trackingNumber: data.trackingNumber }
          : {}),
        ...(data.cancelledReason !== undefined
          ? { cancelledReason: data.cancelledReason }
          : {}),
      },
    })

    // Pixel server-side fire saat transisi ke PAID — fire Purchase. Hanya
    // untuk e-commerce orders (punya invoiceNumber + orderFormId). Best-
    // effort, async, tidak block response.
    if (
      data.paymentStatus === 'PAID' &&
      existing.paymentStatus !== 'PAID' &&
      updated.invoiceNumber &&
      updated.orderFormId
    ) {
      firePixelEventForOrder({
        orderId: updated.id,
        eventName: 'Purchase',
      }).catch(() => {})
    }

    // LMS auto-enrollment — saat transisi ke PAID, cek items dan upsert
    // Enrollment untuk product yg punya courseId. Best-effort, tidak block.
    if (
      data.paymentStatus === 'PAID' &&
      existing.paymentStatus !== 'PAID'
    ) {
      triggerEnrollmentForOrderSafe(updated.id)
    }

    // Follow-Up Order System hooks — detect transition & trigger event.
    // Fire-and-forget; engine handle plan gating + WA gating + dedup.
    const followupEvents: FollowupEvent[] = []
    if (
      data.paymentStatus === 'PAID' &&
      existing.paymentStatus !== 'PAID'
    ) {
      followupEvents.push('PAYMENT_PAID')
    }
    if (
      data.deliveryStatus === 'SHIPPED' &&
      existing.deliveryStatus !== 'SHIPPED'
    ) {
      followupEvents.push('SHIPPED')
    }
    if (
      data.deliveryStatus === 'DELIVERED' &&
      existing.deliveryStatus !== 'DELIVERED'
    ) {
      followupEvents.push('COMPLETED')
    }
    if (
      data.paymentStatus === 'CANCELLED' &&
      existing.paymentStatus !== 'CANCELLED'
    ) {
      // Cancel pending queue dulu — supaya reminder yang udah scheduled tidak
      // ke-kirim. Lalu generate template untuk event CANCELLED kalau user
      // punya.
      cancelQueueForOrder(updated.id, 'Order cancelled').catch((err) =>
        console.error('[orders PATCH] cancelQueue:', err),
      )
      followupEvents.push('CANCELLED')
    }
    for (const event of followupEvents) {
      generateQueueForOrder(updated.id, event).catch((err) =>
        console.error(`[orders PATCH] followup ${event}:`, err),
      )
    }

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
