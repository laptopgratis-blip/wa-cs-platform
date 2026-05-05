// Halaman /pesanan — list pesanan customer yang ditangani AI/script flow.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import {
  OrdersList,
  type OrderListItem,
} from '@/components/orders/OrdersList'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function OrdersPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  // Initial fetch — tab=all, no filter. Client component akan refetch saat
  // filter berubah.
  const [orders, countAll, countPending, countPaid, countShipped, countCompleted] =
    await Promise.all([
      prisma.userOrder.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          customerName: true,
          customerPhone: true,
          customerAddress: true,
          items: true,
          totalAmount: true,
          paymentMethod: true,
          paymentStatus: true,
          deliveryStatus: true,
          trackingNumber: true,
          flowName: true,
          notes: true,
          contactId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.userOrder.count({ where: { userId: session.user.id } }),
      prisma.userOrder.count({
        where: { userId: session.user.id, paymentStatus: 'PENDING' },
      }),
      prisma.userOrder.count({
        where: {
          userId: session.user.id,
          paymentStatus: 'PAID',
          deliveryStatus: { notIn: ['DELIVERED', 'CANCELLED'] },
        },
      }),
      prisma.userOrder.count({
        where: { userId: session.user.id, deliveryStatus: 'SHIPPED' },
      }),
      prisma.userOrder.count({
        where: { userId: session.user.id, deliveryStatus: 'DELIVERED' },
      }),
    ])

  const initial: OrderListItem[] = orders.map((o) => ({
    id: o.id,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    customerAddress: o.customerAddress,
    items: (o.items as { name: string; qty: number; price?: number | null }[]) ?? [],
    totalAmount: o.totalAmount,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    deliveryStatus: o.deliveryStatus,
    trackingNumber: o.trackingNumber,
    flowName: o.flowName,
    notes: o.notes,
    contactId: o.contactId,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  }))

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 overflow-y-auto p-4 md:p-6">
      <OrdersList
        initial={initial}
        initialCounts={{
          all: countAll,
          pending: countPending,
          paid: countPaid,
          shipped: countShipped,
          completed: countCompleted,
        }}
      />
    </div>
  )
}
