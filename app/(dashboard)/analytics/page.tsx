// /analytics — dashboard analytics user. Server component cek session,
// detail UI di client component supaya bisa pakai recharts.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { AnalyticsView } from '@/components/dashboard/AnalyticsView'
import { PageContainer } from '@/components/shared/PageContainer'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function AnalyticsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  return (
    <PageContainer width="wide">
      <AnalyticsView />
    </PageContainer>
  )
}
