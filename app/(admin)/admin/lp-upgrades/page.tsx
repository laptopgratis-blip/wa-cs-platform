// /admin/lp-upgrades — verifikasi pembelian upgrade LP (manual + Tripay).
import { LpUpgradesManager } from '@/components/admin/LpUpgradesManager'
import { PageContainer } from '@/components/shared/PageContainer'

export default function AdminLpUpgradesPage() {
  return (
    <PageContainer width="wide">
      <LpUpgradesManager />
    </PageContainer>
  )
}
