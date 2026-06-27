import { WhatsappSessionsManager } from '@/components/admin/WhatsappSessionsManager'

// Auth sudah dijaga oleh layout route group (admin) + guard requireAdmin() di
// API route, jadi tidak perlu cek role lagi di sini.
export default function AdminWhatsappSessionsPage() {
  return (
    <div className="mx-auto h-full max-w-7xl overflow-y-auto p-4 md:p-6">
      <WhatsappSessionsManager />
    </div>
  )
}
