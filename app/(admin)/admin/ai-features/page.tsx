// /admin/ai-features — manage AiFeatureConfig per feature pricing.
import { AiFeaturesManager } from '@/components/admin/AiFeaturesManager'

export const dynamic = 'force-dynamic'

export default function AdminAiFeaturesPage() {
  return (
    <div className="mx-auto h-full max-w-5xl overflow-y-auto p-4 md:p-6">
      <AiFeaturesManager />
    </div>
  )
}
