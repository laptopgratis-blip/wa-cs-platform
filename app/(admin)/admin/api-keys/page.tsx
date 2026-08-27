// Halaman /admin/api-keys — kelola API key provider AI (encrypted di DB).
import { ApiKeysManager } from '@/components/admin/ApiKeysManager'
import { PageContainer } from '@/components/shared/PageContainer'

export default function AdminApiKeysPage() {
  return (
    <PageContainer>
      <ApiKeysManager />
    </PageContainer>
  )
}
