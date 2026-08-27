// Halaman /admin/packages — CRUD Token Packages.
import { PackagesManager } from '@/components/admin/PackagesManager'
import { PageContainer } from '@/components/shared/PageContainer'

export default function AdminPackagesPage() {
  return (
    <PageContainer>
      <PackagesManager />
    </PageContainer>
  )
}
