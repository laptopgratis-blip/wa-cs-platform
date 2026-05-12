// /admin/settings — pengaturan platform global (key-value).
import { OtpWaSenderPicker } from '@/components/admin/OtpWaSenderPicker'
import { SettingsManager } from '@/components/admin/SettingsManager'
import { NotificationSettingsCard } from '@/components/dashboard/NotificationSettingsCard'

export default function AdminSettingsPage() {
  return (
    <div className="mx-auto h-full max-w-2xl space-y-5 overflow-y-auto p-4 md:p-6">
      <SettingsManager />
      <OtpWaSenderPicker />
      <NotificationSettingsCard />
    </div>
  )
}
