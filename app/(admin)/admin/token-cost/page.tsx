import { TokenCostDashboard } from '@/components/admin/TokenCostDashboard'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Token & Biaya AI · Admin Hulao' }

export default function AdminTokenCostPage() {
  return (
    <div className="mx-auto h-full max-w-7xl overflow-y-auto p-4 md:p-6">
      <TokenCostDashboard />
    </div>
  )
}
