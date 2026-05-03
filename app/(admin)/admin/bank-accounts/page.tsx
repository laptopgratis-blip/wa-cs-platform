// /admin/bank-accounts — CRUD rekening bank tujuan transfer manual.
import { BankAccountsManager } from '@/components/admin/BankAccountsManager'

export default function AdminBankAccountsPage() {
  return (
    <div className="mx-auto h-full max-w-5xl overflow-y-auto p-4 md:p-6">
      <BankAccountsManager />
    </div>
  )
}
