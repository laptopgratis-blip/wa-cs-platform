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
import {
  revokeEntitlementsForOrderSafe,
  triggerEntitlementsForOrderSafe,
} from '@/lib/services/entitlement-hook'
import { refreshPendingFollowUpsForOrder } from '@/lib/services/followup-order-refresh'
import { buildCustomerEditData } from '@/lib/services/orders/customer-edit'
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

  // Jumlah follow-up yang masih terjadwal — dialog memakainya untuk memberi
  // tahu seller bahwa edit data pelanggan ikut berlaku ke antrean tersebut.
  const pendingFollowUpCount = await prisma.followUpQueue.count({
    where: { orderId: order.id, status: 'PENDING' },
  })

  return jsonOk({
    ...order,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    pendingFollowUpCount,
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

  const data = parsed.data

  // Edit data pelanggan (nama / nomor HP / alamat / kode pos). Helper pure
  // menormalisasi nomor ke '628…', menulis alamat ke customerAddress DAN
  // shippingAddress (invoice, slip packing, ekspor & {alamat} follow-up membaca
  // kolom kedua), dan hanya mengembalikan kolom yang benar-benar berubah.
  // Area (provinsi/kota/kecamatan/kelurahan) tidak bisa diedit — terikat ongkir.
  // contactId / relasi Contact SENGAJA tidak diubah saat nomor berubah:
  // riwayat chat tetap menempel ke kontak asal pesanan.
  const customerEdit = buildCustomerEditData(existing, {
    customerName: data.customerName,
    customerPhone: data.customerPhone,
    customerAddress: data.customerAddress,
    shippingPostalCode: data.shippingPostalCode,
  })
  if (!customerEdit.ok) return jsonError(customerEdit.error)

  try {
    const updated = await prisma.userOrder.update({
      where: { id },
      data: {
        ...customerEdit.data,
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

    // Pixel server-side fire — Purchase event dgn granular trigger:
    //   1. ADMIN_PROOF_UPLOAD: admin set paymentProofUrl dari kosong → ada URL
    //      (admin input bukti sendiri via dialog, BUKAN dari buyer upload).
    //      Distinguishing: buyer pakai endpoint terpisah /upload-proof yg tidak
    //      sentuh PATCH ini. Jadi semua PATCH dgn proofUrl transisi = admin.
    //   2. ADMIN_MARK_PAID: paymentStatus transisi → PAID via PATCH admin.
    // Boleh keduanya fire untuk order yang sama dalam satu request kalau admin
    // upload + mark paid sekaligus — dedup di pixel-fire pastikan tidak double.
    // Hanya untuk e-commerce orders (invoiceNumber + orderFormId).
    if (updated.invoiceNumber && updated.orderFormId) {
      const proofAddedByAdmin =
        data.paymentProofUrl !== undefined &&
        data.paymentProofUrl &&
        data.paymentProofUrl.trim() !== '' &&
        (!existing.paymentProofUrl || existing.paymentProofUrl.trim() === '')

      if (proofAddedByAdmin) {
        firePixelEventForOrder({
          orderId: updated.id,
          eventName: 'Purchase',
          trigger: 'ADMIN_PROOF_UPLOAD',
        }).catch(() => {})
      }

      if (
        data.paymentStatus === 'PAID' &&
        existing.paymentStatus !== 'PAID'
      ) {
        firePixelEventForOrder({
          orderId: updated.id,
          eventName: 'Purchase',
          trigger: 'ADMIN_MARK_PAID',
        }).catch(() => {})
      }
    }

    // Entitlement digital (LMS course + e-book) — saat transisi ke PAID,
    // dispatcher grant semua aset digital di order. Best-effort, tidak block.
    if (
      data.paymentStatus === 'PAID' &&
      existing.paymentStatus !== 'PAID'
    ) {
      triggerEntitlementsForOrderSafe(updated.id)
    }

    // Data pelanggan berubah → antrean follow-up yang masih PENDING ikut
    // memakai nomor/nama/alamat baru (pesan yang sudah diedit manual tidak
    // ditimpa). `existing` = snapshot SEBELUM update, dasar deteksi editan
    // manual. Di-await supaya selesai sebelum hook generate di bawah membuat
    // antrean baru; service never-throw, jadi tidak menggagalkan PATCH.
    if (customerEdit.anyChanged) {
      const refresh = await refreshPendingFollowUpsForOrder({
        orderId: updated.id,
        previousOrder: existing,
      })
      if (refresh.error) {
        console.error('[orders PATCH] refresh follow-up:', refresh.error)
      }
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
      // Cabut akses digital (e-book + course) milik order ini — order PAID
      // yang dibatalkan/di-refund tidak boleh menyisakan akses hidup.
      revokeEntitlementsForOrderSafe(
        updated.id,
        data.cancelledReason ?? 'Order dibatalkan',
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
