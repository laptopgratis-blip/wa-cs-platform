// Admin Bank Integrations — kill switch untuk Bank Mutation Auto-Reader.
import { AdminBankIntegrationsClient } from '@/components/admin/AdminBankIntegrationsClient'
import { PageContainer } from '@/components/shared/PageContainer'

export const metadata = {
  title: 'Bank Integrations · Admin Hulao',
}

export default function AdminBankIntegrationsPage() {
  return (
    <PageContainer>
      <AdminBankIntegrationsClient />
    </PageContainer>
  )
}
