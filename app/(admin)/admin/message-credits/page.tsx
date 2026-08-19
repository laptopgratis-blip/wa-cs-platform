// Halaman /admin/message-credits — harga Kredit Pesan WA per kategori
// template Meta + ringkasan pemakaian (Trek 2B).
import { MessageCreditRatesManager } from '@/components/admin/MessageCreditRatesManager'

export default function AdminMessageCreditsPage() {
  return (
    <div className="mx-auto h-full max-w-5xl overflow-y-auto p-4 md:p-6">
      <MessageCreditRatesManager />
    </div>
  )
}
