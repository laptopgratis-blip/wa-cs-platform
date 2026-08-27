// /admin/profitability — dashboard profit aggregate.
import { ProfitabilityDashboard } from '@/components/admin/ProfitabilityDashboard'
import { PageContainer } from '@/components/shared/PageContainer'

export default function AdminProfitabilityPage() {
  return (
    <PageContainer width="wide">
      <ProfitabilityDashboard />
    </PageContainer>
  )
}
