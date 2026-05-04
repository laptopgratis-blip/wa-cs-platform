// Halaman /admin/soul-settings — kurasi SoulPersonality + SoulStyle.
import { SoulSettingsManager } from '@/components/admin/SoulSettingsManager'

export default function AdminSoulSettingsPage() {
  return (
    <div className="mx-auto h-full max-w-6xl overflow-y-auto p-4 md:p-6">
      <SoulSettingsManager />
    </div>
  )
}
