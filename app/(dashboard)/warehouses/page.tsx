// Halaman manajemen gudang (multi-gudang, Fase 1). Saat customer isi alamat,
// sistem otomatis pilih gudang termurah untuk hemat ongkir.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { UpgradeRequired } from '@/components/order-system/UpgradeRequired'
import { WarehousesClient } from '@/components/warehouses/WarehousesClient'
import { authOptions } from '@/lib/auth'
import { checkOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import { WAREHOUSE_LIMIT_PER_USER } from '@/lib/validations/warehouse'

export const metadata = {
  title: 'Gudang · Hulao',
}

export default async function WarehousesPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const access = await checkOrderSystemAccess(session.user.id)
  if (!access.hasAccess) {
    return <UpgradeRequired currentTier={access.currentTier} feature="Gudang" />
  }

  const warehouses = await prisma.warehouse.findMany({
    where: { userId: session.user.id },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  })

  return (
    <WarehousesClient
      initialWarehouses={warehouses.map((w) => ({
        id: w.id,
        name: w.name,
        originId: w.originId,
        cityName: w.cityName,
        provinceName: w.provinceName,
        regionCode: w.regionCode,
        isActive: w.isActive,
        isDefault: w.isDefault,
        createdAt: w.createdAt.toISOString(),
      }))}
      limit={WAREHOUSE_LIMIT_PER_USER}
    />
  )
}
