// /admin/finance — verifikasi manual payment.
import { FinanceManager } from '@/components/admin/FinanceManager'
import { PageContainer } from '@/components/shared/PageContainer'

export default function AdminFinancePage() {
  return (
    <PageContainer width="wide">
      <FinanceManager />
    </PageContainer>
  )
}
