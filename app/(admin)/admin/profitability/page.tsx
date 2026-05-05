// /admin/profitability — dashboard profit aggregate.
import { ProfitabilityDashboard } from '@/components/admin/ProfitabilityDashboard'

export default function AdminProfitabilityPage() {
  return (
    <div className="mx-auto h-full max-w-7xl overflow-y-auto p-4 md:p-6">
      <ProfitabilityDashboard />
    </div>
  )
}
