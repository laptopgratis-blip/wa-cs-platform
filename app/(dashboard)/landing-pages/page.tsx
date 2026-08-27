// /landing-pages — manager Landing Page Builder.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { LpManager } from '@/components/lp/LpManager'
import { PageContainer } from '@/components/shared/PageContainer'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function LandingPagesPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  return (
    <PageContainer>
      <LpManager />
    </PageContainer>
  )
}
