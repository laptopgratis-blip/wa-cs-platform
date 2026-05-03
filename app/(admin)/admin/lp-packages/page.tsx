// /admin/lp-packages — CRUD paket upgrade Landing Page.
import { LpPackagesManager } from '@/components/admin/LpPackagesManager'

export default function AdminLpPackagesPage() {
  return (
    <div className="mx-auto h-full max-w-6xl overflow-y-auto p-4 md:p-6">
      <LpPackagesManager />
    </div>
  )
}
