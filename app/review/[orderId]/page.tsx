// PUBLIC route — /review/<orderId>?t=<token>. Form testimoni 1-klik dari link
// follow-up WA. Token HMAC mengikat orderId (lib/review-token).
import { notFound } from 'next/navigation'

import { ReviewFormPublic } from '@/components/review/ReviewFormPublic'
import { prisma } from '@/lib/prisma'
import { verifyReviewToken } from '@/lib/review-token'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface PageProps {
  params: Promise<{ orderId: string }>
  searchParams: Promise<{ t?: string }>
}

interface OrderItem {
  name?: string
}

export async function generateMetadata() {
  return { title: 'Beri Testimoni · Hulao', robots: { index: false } }
}

export default async function ReviewPage({ params, searchParams }: PageProps) {
  const { orderId } = await params
  const { t } = await searchParams

  if (!verifyReviewToken(orderId, 'review', t)) notFound()

  const order = await prisma.userOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      customerName: true,
      items: true,
      user: { select: { name: true } },
      review: {
        select: {
          rating: true,
          reviewText: true,
          photoUrls: true,
          triedProduct: true,
        },
      },
    },
  })
  if (!order) notFound()

  const items = (order.items as OrderItem[] | null) ?? []
  const productName = items[0]?.name ?? null

  return (
    <ReviewFormPublic
      orderId={order.id}
      token={t as string}
      customerName={order.customerName}
      productName={productName}
      storeName={order.user?.name ?? 'kami'}
      existing={order.review}
    />
  )
}
