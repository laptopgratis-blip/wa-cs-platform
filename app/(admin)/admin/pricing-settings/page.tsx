// /admin/pricing-settings — singleton form 5 field.
import { PricingSettingsManager } from '@/components/admin/PricingSettingsManager'

export default function AdminPricingSettingsPage() {
  return (
    <div className="mx-auto h-full max-w-3xl overflow-y-auto p-4 md:p-6">
      <PricingSettingsManager />
    </div>
  )
}
