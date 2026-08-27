// /admin/lms-packages — CRUD plan upgrade LMS.
import { LmsPackagesManager } from '@/components/admin/LmsPackagesManager'
import { PageContainer } from '@/components/shared/PageContainer'

export default function AdminLmsPackagesPage() {
  return (
    <PageContainer>
      <LmsPackagesManager />
    </PageContainer>
  )
}
