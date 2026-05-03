// Halaman /admin/users — list user + top-up.
import { UsersManager } from '@/components/admin/UsersManager'

export default function AdminUsersPage() {
  return (
    <div className="mx-auto h-full max-w-6xl overflow-y-auto p-4 md:p-6">
      <UsersManager />
    </div>
  )
}
