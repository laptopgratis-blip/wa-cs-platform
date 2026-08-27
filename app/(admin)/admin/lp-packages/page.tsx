// /admin/lp-packages — CRUD paket upgrade Landing Page.
import { LpPackagesManager } from '@/components/admin/LpPackagesManager'
import { PageContainer } from '@/components/shared/PageContainer'

export default function AdminLpPackagesPage() {
  return (
    <PageContainer>
      <LpPackagesManager />
    </PageContainer>
  )
}
