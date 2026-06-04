// /content/post-publish/[lpId] — halaman pasca-publish LP.
// Tampilkan 3 status WA sample full + 12 placeholder. User klik unlock
// untuk top-up token + generate sisa.
import { getServerSession } from 'next-auth'
import { notFound, redirect } from 'next/navigation'

import { PostPublishClient } from '@/components/content/PostPublishClient'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getPostPublishState } from '@/lib/services/post-publish-content'

export const dynamic = 'force-dynamic'

export default async function PostPublishPage({
  params,
}: {
  params: Promise<{ lpId: string }>
}) {
  const { lpId } = await params

  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  // Validasi LP milik user + sudah publish.
  const lp = await prisma.landingPage.findFirst({
    where: { id: lpId, userId: session.user.id },
    select: {
      id: true,
      title: true,
      slug: true,
      isPublished: true,
    },
  })
  if (!lp) notFound()

  const [state, balance] = await Promise.all([
    getPostPublishState({ userId: session.user.id, lpId }),
    prisma.tokenBalance.findUnique({
      where: { userId: session.user.id },
      select: { balance: true },
    }),
  ])

  return (
    <PostPublishClient
      lp={lp}
      initialState={{
        briefId: state.briefId,
        pieces: state.pieces.map((p) => ({
          id: p.id,
          title: p.title,
          bodyJson: p.bodyJson as {
            title?: string
            hook?: string
            body?: string
            cta?: string
            imageHint?: string
          },
          funnelStage: p.funnelStage,
          isPaid: p.isPaid,
          createdAt: p.createdAt.toISOString(),
        })),
        totalGenerated: state.totalGenerated,
        totalExpected: state.totalExpected,
        isComplete: state.isComplete,
      }}
      initialBalance={balance?.balance ?? 0}
    />
  )
}
