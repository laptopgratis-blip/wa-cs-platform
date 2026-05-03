// Halaman /admin/models — CRUD AI Models.
import { ModelsManager } from '@/components/admin/ModelsManager'

export default function AdminModelsPage() {
  return (
    <div className="mx-auto h-full max-w-6xl overflow-y-auto p-4 md:p-6">
      <ModelsManager />
    </div>
  )
}
