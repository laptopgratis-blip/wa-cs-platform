import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { TestimoniClient } from '@/components/review/TestimoniClient'
import { UpgradeRequired } from '@/components/order-system/UpgradeRequired'
import { authOptions } from '@/lib/auth'
import { checkOrderSystemAccess } from '@/lib/order-system-gate'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Testimoni · Hulao',
}

export default async function TestimoniPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const access = await checkOrderSystemAccess(session.user.id)
  if (!access.hasAccess) {
    return (
      <UpgradeRequired currentTier={access.currentTier} feature="Testimoni" />
    )
  }

  return <TestimoniClient />
}
