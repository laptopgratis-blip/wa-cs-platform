import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { MutationsClient } from '@/components/bank-mutation/MutationsClient'
import { UpgradeRequired } from '@/components/order-system/UpgradeRequired'
import { authOptions } from '@/lib/auth'
import { checkOrderSystemAccess } from '@/lib/order-system-gate'

export const metadata = {
  title: 'Mutasi Bank · Hulao',
}

export default async function BankMutationsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const access = await checkOrderSystemAccess(session.user.id)
  if (!access.hasAccess) {
    return (
      <UpgradeRequired
        currentTier={access.currentTier}
        feature="Mutasi Bank"
      />
    )
  }

  return <MutationsClient />
}
