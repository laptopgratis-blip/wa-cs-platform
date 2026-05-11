import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { UpgradeRequired } from '@/components/order-system/UpgradeRequired'
import { PixelsClient } from '@/components/pixels/PixelsClient'
import { authOptions } from '@/lib/auth'
import { checkOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import { PIXEL_INTEGRATION_LIMIT_PER_USER } from '@/lib/validations/pixel-integration'

export const metadata = {
  title: 'Pixel Tracking · Hulao',
}

export default async function PixelsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const access = await checkOrderSystemAccess(session.user.id)
  if (!access.hasAccess) {
    return (
      <UpgradeRequired
        currentTier={access.currentTier}
        feature="Pixel Tracking"
      />
    )
  }

  const items = await prisma.pixelIntegration.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <PixelsClient
      initialItems={items.map((p) => ({
        id: p.id,
        platform: p.platform,
        displayName: p.displayName,
        pixelId: p.pixelId,
        serverSideEnabled: p.serverSideEnabled,
        accessTokenSet: !!p.accessToken,
        conversionLabelInitiateCheckout: p.conversionLabelInitiateCheckout,
        conversionLabelLead: p.conversionLabelLead,
        conversionLabelPurchase: p.conversionLabelPurchase,
        testEventCode: p.testEventCode,
        isTestMode: p.isTestMode,
        triggerOnBuyerProofUpload: p.triggerOnBuyerProofUpload,
        triggerOnAdminProofUpload: p.triggerOnAdminProofUpload,
        triggerOnAdminMarkPaid: p.triggerOnAdminMarkPaid,
        isActive: p.isActive,
        totalEvents: p.totalEvents,
        lastEventAt: p.lastEventAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
      }))}
      limit={PIXEL_INTEGRATION_LIMIT_PER_USER}
    />
  )
}
