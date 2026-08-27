import { WhatsappSessionsManager } from '@/components/admin/WhatsappSessionsManager'
import { PageContainer } from '@/components/shared/PageContainer'

// Auth sudah dijaga oleh layout route group (admin) + guard requireAdmin() di
// API route, jadi tidak perlu cek role lagi di sini.
export default function AdminWhatsappSessionsPage() {
  return (
    <PageContainer width="wide">
      <WhatsappSessionsManager />
    </PageContainer>
  )
}
