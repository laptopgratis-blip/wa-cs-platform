// /billing/subscription — manage subscription plan user.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { SubscriptionDashboard } from '@/components/subscription/SubscriptionDashboard'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function BillingSubscriptionPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login?callbackUrl=/billing/subscription')
  return <SubscriptionDashboard />
}
