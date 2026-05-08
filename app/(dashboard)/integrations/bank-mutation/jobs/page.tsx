import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { JobsClient } from '@/components/bank-mutation/JobsClient'
import { UpgradeRequired } from '@/components/order-system/UpgradeRequired'
import { authOptions } from '@/lib/auth'
import { checkOrderSystemAccess } from '@/lib/order-system-gate'

export const metadata = {
  title: 'Bank Scrape Jobs · Hulao',
}

export default async function BankJobsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const access = await checkOrderSystemAccess(session.user.id)
  if (!access.hasAccess) {
    return (
      <UpgradeRequired
        currentTier={access.currentTier}
        feature="Bank Scrape Jobs"
      />
    )
  }
  return <JobsClient />
}
