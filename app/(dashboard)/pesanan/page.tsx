// Halaman /pesanan — list pesanan customer.
// Server cuma handle auth + plan check. Client OrdersList yang fetch via
// /api/orders dengan filter cursor pagination.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { OrdersList } from '@/components/orders/OrdersList'
import { PageContainer } from '@/components/shared/PageContainer'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Pesanan · Hulao',
}

export default async function OrdersPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  return (
    <PageContainer width="wide">
      <OrdersList />
    </PageContainer>
  )
}
