// /admin/lms-packages — CRUD plan upgrade LMS.
import { LmsPackagesManager } from '@/components/admin/LmsPackagesManager'

export default function AdminLmsPackagesPage() {
  return (
    <div className="mx-auto h-full max-w-6xl overflow-y-auto p-4 md:p-6">
      <LmsPackagesManager />
    </div>
  )
}
