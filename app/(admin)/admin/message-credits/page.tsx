// Halaman /admin/message-credits — harga Kredit Pesan WA per kategori
// template Meta + ringkasan pemakaian (Trek 2B).
import { MessageCreditRatesManager } from '@/components/admin/MessageCreditRatesManager'
import { PageContainer } from '@/components/shared/PageContainer'

export default function AdminMessageCreditsPage() {
  return (
    <PageContainer>
      <MessageCreditRatesManager />
    </PageContainer>
  )
}
