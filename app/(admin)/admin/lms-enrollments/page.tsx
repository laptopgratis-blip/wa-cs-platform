// /admin/lms-enrollments — search + manual add/revoke enrollment LMS.
import { LmsEnrollmentsManager } from '@/components/admin/LmsEnrollmentsManager'

export default function AdminLmsEnrollmentsPage() {
  return (
    <div className="mx-auto h-full max-w-6xl overflow-y-auto p-4 md:p-6">
      <LmsEnrollmentsManager />
    </div>
  )
}
