import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { MetaTemplateBanner } from '@/components/followup/MetaTemplateBanner'
import { TemplatesClient } from '@/components/followup/TemplatesClient'
import { UpgradeRequired } from '@/components/order-system/UpgradeRequired'
import { PageContainer } from '@/components/shared/PageContainer'
import { authOptions } from '@/lib/auth'
import { checkOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Template Follow-Up · Hulao',
}

export default async function TemplatesPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const access = await checkOrderSystemAccess(session.user.id)
  if (!access.hasAccess) {
    return (
      <UpgradeRequired
        currentTier={access.currentTier}
        feature="Template Follow-Up"
      />
    )
  }

  // Forms untuk dropdown scope=FORM + sesi Cloud API (untuk banner template Meta).
  const [forms, cloudSessions] = await Promise.all([
    prisma.orderForm.findMany({
      where: { userId: session.user.id, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.whatsappSession.findMany({
      where: {
        userId: session.user.id,
        provider: 'CLOUD_API',
        isActive: true,
        wabaId: { not: null },
      },
      select: { id: true, displayName: true, phoneNumber: true },
      orderBy: { updatedAt: 'desc' },
    }),
  ])

  // Container halaman dipegang di sini (bukan di TemplatesClient) supaya banner
  // template Meta + isi klien berbagi satu wrapper — tidak dobel padding.
  return (
    <PageContainer>
      {cloudSessions.length > 0 && (
        <MetaTemplateBanner sessions={cloudSessions} />
      )}
      <TemplatesClient forms={forms} />
    </PageContainer>
  )
}
