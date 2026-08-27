// /admin/lms-enrollments — search + manual add/revoke enrollment LMS.
import { LmsEnrollmentsManager } from '@/components/admin/LmsEnrollmentsManager'
import { PageContainer } from '@/components/shared/PageContainer'

export default function AdminLmsEnrollmentsPage() {
  return (
    <PageContainer>
      <LmsEnrollmentsManager />
    </PageContainer>
  )
}
