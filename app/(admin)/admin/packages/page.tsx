// Halaman /admin/packages — CRUD Token Packages.
import { PackagesManager } from '@/components/admin/PackagesManager'

export default function AdminPackagesPage() {
  return (
    <div className="mx-auto h-full max-w-6xl overflow-y-auto p-4 md:p-6">
      <PackagesManager />
    </div>
  )
}
