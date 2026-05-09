// /landing-pages/[lpId]/lab — LP Lab dashboard.
// Server component: validate ownership + plan POWER, lalu render client.
// Plan gate dilakukan di client (UpgradeRequired component) supaya UX
// lebih friendly daripada redirect/404.
import { getServerSession } from 'next-auth'
import { notFound, redirect } from 'next/navigation'

import { LpLabClient } from '@/components/lp-lab/LpLabClient'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface Props {
  params: Promise<{ lpId: string }>
}

export const metadata = {
  title: 'LP Lab · Hulao',
}

export default async function LpLabPage({ params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { lpId } = await params
  const lp = await prisma.landingPage.findUnique({
    where: { id: lpId },
    select: {
      id: true,
      userId: true,
      title: true,
      slug: true,
      isPublished: true,
      user: { select: { lpQuota: { select: { tier: true } } } },
    },
  })
  if (!lp) notFound()
  if (lp.userId !== session.user.id) notFound() // jangan reveal existence

  const tier = lp.user.lpQuota?.tier ?? 'FREE'

  return (
    <LpLabClient
      lp={{ id: lp.id, title: lp.title, slug: lp.slug, isPublished: lp.isPublished }}
      tier={tier}
    />
  )
}
