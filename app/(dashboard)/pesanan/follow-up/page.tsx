import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { FollowUpClient } from '@/components/followup/FollowUpClient'
import { UpgradeRequired } from '@/components/order-system/UpgradeRequired'
import { authOptions } from '@/lib/auth'
import { checkOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Follow-Up Pesanan · Hulao',
}

export default async function FollowUpPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const access = await checkOrderSystemAccess(session.user.id)
  if (!access.hasAccess) {
    return (
      <UpgradeRequired
        currentTier={access.currentTier}
        feature="Follow-Up Pesanan"
      />
    )
  }

  // Cek WA gating supaya client bisa tampilkan banner kalau perlu.
  const waSession = await prisma.whatsappSession.findFirst({
    where: { userId: session.user.id, status: 'CONNECTED' },
    select: { id: true },
  })

  // Cek apakah user udah punya template — kalau belum, tampilkan CTA enable
  // (auto-seed default templates).
  const templateCount = await prisma.followUpTemplate.count({
    where: { userId: session.user.id },
  })

  return (
    <FollowUpClient
      waConnected={Boolean(waSession)}
      hasTemplates={templateCount > 0}
    />
  )
}
