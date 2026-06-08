// PUBLIC route — /diterima/<orderId>?t=<token>. Konfirmasi "sudah diterima"
// 1-klik dari link follow-up WA ({link_terima}). Token HMAC purpose 'terima'.
import { notFound } from 'next/navigation'

import { ConfirmReceivedPublic } from '@/components/review/ConfirmReceivedPublic'
import { prisma } from '@/lib/prisma'
import { reviewLink, verifyReviewToken } from '@/lib/review-token'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface PageProps {
  params: Promise<{ orderId: string }>
  searchParams: Promise<{ t?: string }>
}

export async function generateMetadata() {
  return { title: 'Konfirmasi Pesanan Diterima · Hulao', robots: { index: false } }
}

export default async function ConfirmReceivedPage({
  params,
  searchParams,
}: PageProps) {
  const { orderId } = await params
  const { t } = await searchParams

  if (!verifyReviewToken(orderId, 'terima', t)) notFound()

  const order = await prisma.userOrder.findUnique({
    where: { id: orderId },
    select: { id: true, customerName: true, deliveryStatus: true },
  })
  if (!order) notFound()

  return (
    <ConfirmReceivedPublic
      orderId={order.id}
      token={t as string}
      customerName={order.customerName}
      alreadyDelivered={order.deliveryStatus === 'DELIVERED'}
      reviewUrl={reviewLink(order.id)}
    />
  )
}
