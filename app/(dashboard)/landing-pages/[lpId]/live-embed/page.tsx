// /landing-pages/[lpId]/live-embed — Config Live AI Embed.
// Server component: validasi owner + load LP + render client config.
import { getServerSession } from 'next-auth'
import { notFound, redirect } from 'next/navigation'

import { LpLiveEmbedConfig } from '@/components/lp/LpLiveEmbedConfig'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function LiveEmbedConfigPage({
  params,
}: {
  params: Promise<{ lpId: string }>
}) {
  const { lpId } = await params

  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const lp = await prisma.landingPage.findUnique({
    where: { id: lpId },
    select: { id: true, userId: true, slug: true, title: true },
  })
  if (!lp || lp.userId !== session.user.id) notFound()

  return <LpLiveEmbedConfig lpId={lp.id} lpSlug={lp.slug} lpTitle={lp.title} />
}
