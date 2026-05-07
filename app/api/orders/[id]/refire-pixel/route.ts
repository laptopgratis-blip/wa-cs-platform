// POST /api/orders/[id]/refire-pixel
// Body: { eventName: 'Purchase' | 'Lead' | ... }
// Manual re-fire pixel event untuk order spesifik. Berguna untuk recover
// kalau pixel sebelumnya gagal (mis. Meta API down sesaat) dan user mau
// retry sekarang tanpa nunggu cron.
//
// Plan-gate POWER. firePixelEventForOrder sudah dedup-aware — kalau event
// sudah succeeded, akan di-skip; kalau gagal, di-retry.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { firePixelEventForOrder } from '@/lib/services/pixel-fire'
import { prisma } from '@/lib/prisma'

const refireSchema = z.object({
  eventName: z.enum([
    'Purchase',
    'Lead',
    'AddPaymentInfo',
    'InitiateCheckout',
    'AddToCart',
    'ViewContent',
  ]),
})

export async function POST(
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

  const order = await prisma.userOrder.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, orderFormId: true, invoiceNumber: true },
  })
  if (!order) return jsonError('Pesanan tidak ditemukan', 404)
  if (!order.orderFormId || !order.invoiceNumber) {
    return jsonError(
      'Order ini bukan dari Form Order publik — tidak ada pixel untuk re-fire',
      400,
    )
  }

  const json = await req.json().catch(() => null)
  const parsed = refireSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }

  const result = await firePixelEventForOrder({
    orderId: id,
    eventName: parsed.data.eventName,
    source: 'SERVER',
  })

  return jsonOk({
    eventName: parsed.data.eventName,
    fired: result.fired,
    succeeded: result.succeeded,
    skipped: result.skipped,
  })
}
