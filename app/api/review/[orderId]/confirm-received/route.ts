// POST /api/review/[orderId]/confirm-received (PUBLIC, token-gated)
// Customer klik {link_terima} → tandai order DELIVERED (kalau belum) +
// trigger follow-up COMPLETED (mis. template testimoni DAYS_AFTER_DELIVERED).
// Idempotent: kalau sudah DELIVERED/CANCELLED, tidak diubah lagi.
import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api'
import { generateQueueForOrder } from '@/lib/services/followup-engine'
import { prisma } from '@/lib/prisma'
import { verifyReviewToken } from '@/lib/review-token'

const schema = z.object({ token: z.string().min(10) })

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError('Token wajib', 400)

  if (!verifyReviewToken(orderId, 'terima', parsed.data.token)) {
    return jsonError('Link tidak valid', 403)
  }

  const order = await prisma.userOrder.findUnique({
    where: { id: orderId },
    select: { id: true, deliveryStatus: true },
  })
  if (!order) return jsonError('Order tidak ditemukan', 404)

  // Sudah final → idempotent, anggap sukses tanpa ubah apa-apa.
  if (
    order.deliveryStatus === 'DELIVERED' ||
    order.deliveryStatus === 'CANCELLED'
  ) {
    return jsonOk({ confirmed: true, alreadyDelivered: order.deliveryStatus === 'DELIVERED' })
  }

  await prisma.userOrder.update({
    where: { id: order.id },
    data: { deliveryStatus: 'DELIVERED', deliveredAt: new Date() },
  })

  // Trigger follow-up COMPLETED (+ DAYS_AFTER_DELIVERED testimoni). Best-effort.
  try {
    await generateQueueForOrder(order.id, 'COMPLETED')
  } catch (err) {
    console.error('[confirm-received] generateQueueForOrder gagal', err)
  }

  return jsonOk({ confirmed: true, alreadyDelivered: false })
}
