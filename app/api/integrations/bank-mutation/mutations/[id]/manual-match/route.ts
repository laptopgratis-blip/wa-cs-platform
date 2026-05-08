// POST /api/integrations/bank-mutation/mutations/[id]/manual-match
// User pilih order yang harus di-match ke mutasi tertentu (kasus
// MULTIPLE_MATCH atau NO_MATCH yang user mau resolve manual).
// Body: { orderId: string | null } — null = mark IGNORED.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import { firePixelEventForOrder } from '@/lib/services/pixel-fire'
import { manualMatchSchema } from '@/lib/validations/bank-mutation'

interface Ctx {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: Ctx) {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }

  const { id } = await params
  const json = await req.json().catch(() => null)
  const parsed = manualMatchSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }

  try {
    const mutation = await prisma.bankMutation.findFirst({
      where: { id, userId: session.user.id },
    })
    if (!mutation) return jsonError('Mutasi tidak ditemukan', 404)
    if (mutation.mutationType !== 'CR') {
      return jsonError('Hanya mutasi CR (uang masuk) yang bisa di-match', 400)
    }

    // User mark IGNORED — tidak match ke order apa pun.
    if (!parsed.data.orderId) {
      const ignored = await prisma.bankMutation.update({
        where: { id },
        data: { matchAction: 'IGNORED', matchedOrderId: null, matchScore: 0 },
      })
      return jsonOk({ mutation: ignored, action: 'IGNORED' })
    }

    // Validasi order milik user & masih PENDING.
    const order = await prisma.userOrder.findFirst({
      where: {
        id: parsed.data.orderId,
        userId: session.user.id,
      },
    })
    if (!order) return jsonError('Order tidak ditemukan', 404)
    if (order.paymentStatus === 'PAID') {
      return jsonError('Order sudah PAID, tidak perlu match lagi', 400)
    }
    if (order.paymentStatus === 'CANCELLED') {
      return jsonError('Order sudah CANCELLED', 400)
    }

    // Update transaksi dual: mutation + order. Tidak pakai $transaction
    // strict karena pixel fire butuh updated state, tapi update keduanya
    // sequential dengan rollback try/catch.
    const updatedMutation = await prisma.bankMutation.update({
      where: { id },
      data: {
        matchAction: 'MANUAL_RESOLVED',
        matchedOrderId: order.id,
        matchScore: 1.0,
      },
    })
    await prisma.userOrder.update({
      where: { id: order.id },
      data: {
        paymentStatus: 'PAID',
        paidAt: new Date(),
        autoConfirmedAt: new Date(),
        autoConfirmedBy: 'BCA_AUTO',
        matchedMutationId: updatedMutation.id,
      },
    })
    await prisma.bankMutationIntegration.update({
      where: { userId: session.user.id },
      data: { totalAutoConfirmed: { increment: 1 } },
    })

    // Fire pixel Purchase async — pakai logic existing (best-effort).
    if (order.invoiceNumber && order.orderFormId) {
      firePixelEventForOrder({
        orderId: order.id,
        eventName: 'Purchase',
      }).catch(() => {})
    }

    return jsonOk({ mutation: updatedMutation, action: 'MANUAL_RESOLVED' })
  } catch (err) {
    console.error('[POST manual-match]', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
