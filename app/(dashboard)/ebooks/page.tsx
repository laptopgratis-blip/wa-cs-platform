// /ebooks — kelola e-book (aset digital PDF/EPUB) + statistik penjualan &
// daftar pembeli. Gate: Order System (paket POWER), sama dgn /products.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { EbookSalesClient } from '@/components/ebooks/EbookSalesClient'
import { UpgradeRequired } from '@/components/order-system/UpgradeRequired'
import { PageContainer } from '@/components/shared/PageContainer'
import { authOptions } from '@/lib/auth'
import { checkOrderSystemAccess } from '@/lib/order-system-gate'

export const metadata = {
  title: 'E-Book · Hulao',
}

export default async function EbooksPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const access = await checkOrderSystemAccess(session.user.id)
  if (!access.hasAccess) {
    return <UpgradeRequired currentTier={access.currentTier} feature="E-Book" />
  }

  return (
    <PageContainer>
      <EbookSalesClient />
    </PageContainer>
  )
}
