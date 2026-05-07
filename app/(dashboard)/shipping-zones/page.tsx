import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { UpgradeRequired } from '@/components/order-system/UpgradeRequired'
import { ShippingZonesClient } from '@/components/shipping-zones/ShippingZonesClient'
import { authOptions } from '@/lib/auth'
import { checkOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import { SHIPPING_ZONE_LIMIT_PER_USER } from '@/lib/validations/shipping-zone'

export const metadata = {
  title: 'Zona Ongkir · Hulao',
}

export default async function ShippingZonesPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const access = await checkOrderSystemAccess(session.user.id)
  if (!access.hasAccess) {
    return (
      <UpgradeRequired
        currentTier={access.currentTier}
        feature="Zona Ongkir"
      />
    )
  }

  const zones = await prisma.shippingZone.findMany({
    where: { userId: session.user.id },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
  })

  return (
    <ShippingZonesClient
      initialZones={zones.map((z) => ({
        ...z,
        startsAt: z.startsAt?.toISOString() ?? null,
        endsAt: z.endsAt?.toISOString() ?? null,
        createdAt: z.createdAt.toISOString(),
        updatedAt: z.updatedAt.toISOString(),
      }))}
      limit={SHIPPING_ZONE_LIMIT_PER_USER}
    />
  )
}
