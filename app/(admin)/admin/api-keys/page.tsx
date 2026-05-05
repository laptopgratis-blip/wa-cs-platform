// Halaman /admin/api-keys — kelola API key provider AI (encrypted di DB).
import { ApiKeysManager } from '@/components/admin/ApiKeysManager'

export default function AdminApiKeysPage() {
  return (
    <div className="mx-auto h-full max-w-5xl overflow-y-auto p-4 md:p-6">
      <ApiKeysManager />
    </div>
  )
}
