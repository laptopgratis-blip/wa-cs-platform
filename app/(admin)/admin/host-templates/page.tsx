// /admin/host-templates — admin manage host library (CS Live AI).
// Pakai endpoint admin (isPublic default true → masuk library publik).
import { HostTemplatesManager } from '@/components/admin/HostTemplatesManager'
import { PresetThumbnailsCard } from '@/components/admin/PresetThumbnailsCard'
import { PageContainer } from '@/components/shared/PageContainer'

export const dynamic = 'force-dynamic'

export default function AdminHostTemplatesPage() {
  return (
    <PageContainer>
      <PresetThumbnailsCard />
      <HostTemplatesManager
        apiListBase="/api/admin/host-templates"
        apiItemBase="/api/admin/host-templates"
        apiUploadPath="/api/admin/host-templates/upload"
        detailHrefBase="/admin/host-templates"
        title="CS Live AI — Host Library (Admin)"
        subtitle="Bikin template host yang masuk ke library publik (isPublic=true). User bisa pakai langsung di live room."
      />
    </PageContainer>
  )
}
