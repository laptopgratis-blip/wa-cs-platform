import { TokenCostDashboard } from '@/components/admin/TokenCostDashboard'
import { PageContainer } from '@/components/shared/PageContainer'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Token & Biaya AI · Admin Hulao' }

export default function AdminTokenCostPage() {
  return (
    <PageContainer width="wide">
      <TokenCostDashboard />
    </PageContainer>
  )
}
