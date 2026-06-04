// /host-templates — user bikin host AI sendiri (Phase 2 brief, 2026-06-01).
// Reuse HostTemplatesManager dengan endpoint user-side. isPublic forced false
// di backend (admin only yg bisa publish ke library).
import { HostTemplatesManager } from '@/components/admin/HostTemplatesManager'

export const dynamic = 'force-dynamic'

export default function UserHostTemplatesPage() {
  return (
    <div className="mx-auto h-full max-w-6xl overflow-y-auto p-4 md:p-6">
      <HostTemplatesManager
        apiListBase="/api/host-templates/me"
        apiItemBase="/api/host-templates"
        apiUploadPath="/api/host-templates/upload"
        detailHrefBase="/host-templates"
        title="Host AI Saya"
        subtitle="Bikin avatar host AI sendiri untuk Live Room. Pilih opsi → Claude susun prompt → Gemini bikin gambar → tambah scenes (idle/joget/lompat/dll) lewat Kling. Token dipotong dari saldo Anda."
      />
    </div>
  )
}
