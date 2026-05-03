// /analytics — dashboard analytics user. Server component cek session,
// detail UI di client component supaya bisa pakai recharts.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { AnalyticsView } from '@/components/dashboard/AnalyticsView'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function AnalyticsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  return (
    <div className="mx-auto h-full max-w-7xl overflow-y-auto p-4 md:p-6">
      <AnalyticsView />
    </div>
  )
}
