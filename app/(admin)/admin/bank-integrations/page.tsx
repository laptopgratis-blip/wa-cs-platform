// Admin Bank Integrations — kill switch untuk Bank Mutation Auto-Reader.
import { AdminBankIntegrationsClient } from '@/components/admin/AdminBankIntegrationsClient'

export const metadata = {
  title: 'Bank Integrations · Admin Hulao',
}

export default function AdminBankIntegrationsPage() {
  return (
    <div className="mx-auto h-full max-w-6xl overflow-y-auto p-4 md:p-6">
      <AdminBankIntegrationsClient />
    </div>
  )
}
