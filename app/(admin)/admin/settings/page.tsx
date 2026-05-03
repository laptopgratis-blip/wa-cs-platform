// /admin/settings — pengaturan platform global (key-value).
import { SettingsManager } from '@/components/admin/SettingsManager'

export default function AdminSettingsPage() {
  return (
    <div className="mx-auto h-full max-w-2xl overflow-y-auto p-4 md:p-6">
      <SettingsManager />
    </div>
  )
}
