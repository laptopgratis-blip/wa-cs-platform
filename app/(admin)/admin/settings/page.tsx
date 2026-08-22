// /admin/settings — pengaturan platform global (key-value).
import { OtpWaSenderPicker } from '@/components/admin/OtpWaSenderPicker'
import { SettingsManager } from '@/components/admin/SettingsManager'
import { NotificationSettingsCard } from '@/components/dashboard/NotificationSettingsCard'
import { PageContainer } from '@/components/shared/PageContainer'

export default function AdminSettingsPage() {
  return (
    <PageContainer width="narrow">
      <SettingsManager />
      <OtpWaSenderPicker />
      <NotificationSettingsCard />
    </PageContainer>
  )
}
