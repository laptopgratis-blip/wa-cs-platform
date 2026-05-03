// /admin/lp-upgrades — verifikasi pembelian upgrade LP (manual + Tripay).
import { LpUpgradesManager } from '@/components/admin/LpUpgradesManager'

export default function AdminLpUpgradesPage() {
  return (
    <div className="mx-auto h-full max-w-7xl overflow-y-auto p-4 md:p-6">
      <LpUpgradesManager />
    </div>
  )
}
