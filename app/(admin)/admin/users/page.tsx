// Halaman /admin/users — list user + top-up.
import { UsersManager } from '@/components/admin/UsersManager'
import { PageContainer } from '@/components/shared/PageContainer'

export default function AdminUsersPage() {
  return (
    <PageContainer>
      <UsersManager />
    </PageContainer>
  )
}
