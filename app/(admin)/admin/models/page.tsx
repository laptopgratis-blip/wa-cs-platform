// Halaman /admin/models — CRUD AI Models.
import { ModelsManager } from '@/components/admin/ModelsManager'
import { PageContainer } from '@/components/shared/PageContainer'

export default function AdminModelsPage() {
  return (
    <PageContainer>
      <ModelsManager />
    </PageContainer>
  )
}
