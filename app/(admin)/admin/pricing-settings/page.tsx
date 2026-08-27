// /admin/pricing-settings — singleton form 5 field.
import { PricingSettingsManager } from '@/components/admin/PricingSettingsManager'
import { PageContainer } from '@/components/shared/PageContainer'

export default function AdminPricingSettingsPage() {
  return (
    <PageContainer width="narrow">
      <PricingSettingsManager />
    </PageContainer>
  )
}
