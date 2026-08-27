// /admin/bank-accounts — CRUD rekening bank tujuan transfer manual.
import { BankAccountsManager } from '@/components/admin/BankAccountsManager'
import { PageContainer } from '@/components/shared/PageContainer'

export default function AdminBankAccountsPage() {
  return (
    <PageContainer>
      <BankAccountsManager />
    </PageContainer>
  )
}
