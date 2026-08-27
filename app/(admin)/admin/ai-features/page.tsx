// /admin/ai-features — manage AiFeatureConfig per feature pricing.
import { AiFeaturesManager } from '@/components/admin/AiFeaturesManager'
import { PageContainer } from '@/components/shared/PageContainer'

export const dynamic = 'force-dynamic'

export default function AdminAiFeaturesPage() {
  return (
    <PageContainer>
      <AiFeaturesManager />
    </PageContainer>
  )
}
