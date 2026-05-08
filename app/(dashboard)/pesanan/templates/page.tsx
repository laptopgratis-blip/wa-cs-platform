import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { TemplatesClient } from '@/components/followup/TemplatesClient'
import { UpgradeRequired } from '@/components/order-system/UpgradeRequired'
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

  // Forms untuk dropdown scope=FORM.
  const forms = await prisma.orderForm.findMany({
    where: { userId: session.user.id, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  return <TemplatesClient forms={forms} />
}
