// /landing-pages — manager Landing Page Builder.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { LpManager } from '@/components/lp/LpManager'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function LandingPagesPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  return (
    <div className="mx-auto h-full max-w-6xl overflow-y-auto p-4 md:p-6">
      <LpManager />
    </div>
  )
}
