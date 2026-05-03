// /admin/finance — verifikasi manual payment.
import { FinanceManager } from '@/components/admin/FinanceManager'

export default function AdminFinancePage() {
  return (
    <div className="mx-auto h-full max-w-7xl overflow-y-auto p-4 md:p-6">
      <FinanceManager />
    </div>
  )
}
