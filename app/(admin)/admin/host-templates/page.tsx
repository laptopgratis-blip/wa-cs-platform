// /admin/host-templates — admin manage host library (CS Live AI).
// Pakai endpoint admin (isPublic default true → masuk library publik).
import { HostTemplatesManager } from '@/components/admin/HostTemplatesManager'

export const dynamic = 'force-dynamic'

export default function AdminHostTemplatesPage() {
  return (
    <div className="mx-auto h-full max-w-6xl overflow-y-auto p-4 md:p-6">
      <HostTemplatesManager
        apiListBase="/api/admin/host-templates"
        apiItemBase="/api/admin/host-templates"
        apiUploadPath="/api/admin/host-templates/upload"
        detailHrefBase="/admin/host-templates"
        title="CS Live AI — Host Library (Admin)"
        subtitle="Bikin template host yang masuk ke library publik (isPublic=true). User bisa pakai langsung di live room."
      />
    </div>
  )
}
