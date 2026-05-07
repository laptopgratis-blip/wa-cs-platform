import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { UpgradeRequired } from '@/components/order-system/UpgradeRequired'
import { PixelLogsClient } from '@/components/pixels/PixelLogsClient'
import { authOptions } from '@/lib/auth'
import { checkOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'

export const metadata = {
  title: 'Pixel Logs · Hulao',
}

export default async function PixelLogsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const access = await checkOrderSystemAccess(session.user.id)
  if (!access.hasAccess) {
    return (
      <UpgradeRequired
        currentTier={access.currentTier}
        feature="Pixel Logs"
      />
    )
  }

  // Fetch list pixel untuk dropdown filter (label > id-only).
  const pixels = await prisma.pixelIntegration.findMany({
    where: { userId: session.user.id },
    select: { id: true, displayName: true, platform: true },
    orderBy: { createdAt: 'desc' },
  })

  return <PixelLogsClient pixels={pixels} />
}
