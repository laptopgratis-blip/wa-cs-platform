// /admin/subscriptions — admin manage all subscriptions.
import { RefreshCw } from 'lucide-react'

import { AdminSubscriptionsView } from '@/components/admin/AdminSubscriptionsView'
import { PageContainer } from '@/components/shared/PageContainer'
import { PageHeader } from '@/components/shared/PageHeader'

export const dynamic = 'force-dynamic'

export default function AdminSubscriptionsPage() {
  return (
    <PageContainer>
      <PageHeader
        icon={RefreshCw}
        title="Subscriptions"
        description="Kelola subscription user — approve manual transfer, extend, cancel."
      />
      <AdminSubscriptionsView />
    </PageContainer>
  )
}
