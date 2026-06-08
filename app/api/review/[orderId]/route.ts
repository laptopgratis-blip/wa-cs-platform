// POST /api/review/[orderId] (PUBLIC, token-gated)
// Customer submit testimoni via link {link_review}. Token HMAC mengikat orderId.
// Upsert OrderReview (1 per order) — idempotent kalau submit ulang.
import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { verifyReviewToken } from '@/lib/review-token'

const reviewSchema = z.object({
  token: z.string().min(10),
  rating: z.number().int().min(1).max(5),
  reviewText: z.string().trim().max(2000).optional(),
  triedProduct: z.boolean().optional(),
  photoUrls: z.array(z.string().trim().max(500)).max(5).optional(),
})

interface OrderItem {
  name?: string
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params
  const parsed = reviewSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid', 400)
  }
  const data = parsed.data

  if (!verifyReviewToken(orderId, 'review', data.token)) {
    return jsonError('Link tidak valid atau kedaluwarsa', 403)
  }

  const order = await prisma.userOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      userId: true,
      customerName: true,
      customerPhone: true,
      items: true,
    },
  })
  if (!order) return jsonError('Order tidak ditemukan', 404)

  const items = (order.items as OrderItem[] | null) ?? []
  const productName = items[0]?.name ?? null

  // photoUrls hanya terima path internal /uploads/reviews/... (anti-abuse).
  const photoUrls = (data.photoUrls ?? []).filter((u) =>
    u.startsWith('/uploads/reviews/'),
  )

  await prisma.orderReview.upsert({
    where: { orderId: order.id },
    create: {
      userId: order.userId,
      orderId: order.id,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      productName,
      rating: data.rating,
      reviewText: data.reviewText || null,
      triedProduct: data.triedProduct ?? true,
      photoUrls,
      source: 'REVIEW_LINK',
    },
    update: {
      rating: data.rating,
      reviewText: data.reviewText || null,
      triedProduct: data.triedProduct ?? true,
      photoUrls,
      // submit ulang → reset approved supaya owner kurasi versi terbaru.
      approved: false,
    },
  })

  return jsonOk({ saved: true })
}

// GET status review untuk page (cek apakah sudah pernah submit).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params
  const token = new URL(req.url).searchParams.get('t')
  if (!verifyReviewToken(orderId, 'review', token)) {
    return jsonError('Link tidak valid', 403)
  }
  const review = await prisma.orderReview.findUnique({
    where: { orderId },
    select: { rating: true, reviewText: true, photoUrls: true, triedProduct: true },
  })
  return jsonOk({ review })
}
