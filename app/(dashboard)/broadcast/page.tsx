// Halaman /broadcast — form + list.
import type { PipelineStage } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { BroadcastView } from '@/components/broadcast/BroadcastView'
import type {
  BroadcastListItem,
  SessionOption,
} from '@/components/broadcast/types'
import { PageContainer } from '@/components/shared/PageContainer'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  BROADCAST_LIST_SELECT,
  serializeBroadcastRow,
} from '@/lib/services/broadcast/list-select'

export const dynamic = 'force-dynamic'

export default async function BroadcastPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const userId = session.user.id

  const [broadcasts, sessions, contactsForTags] = await Promise.all([
    prisma.broadcast.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: BROADCAST_LIST_SELECT,
    }),
    prisma.whatsappSession.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        displayName: true,
        phoneNumber: true,
        status: true,
        provider: true,
        wabaId: true,
      },
    }),
    prisma.contact.findMany({
      where: { userId },
      select: { tags: true },
      take: 500,
    }),
  ])

  const tagSet = new Set<string>()
  for (const c of contactsForTags) for (const t of c.tags) tagSet.add(t)

  const initialBroadcasts: BroadcastListItem[] = broadcasts.map((b) => ({
    ...serializeBroadcastRow(b),
    targetStages: b.targetStages as PipelineStage[],
  }))

  const sessionOptions: SessionOption[] = sessions

  return (
    <PageContainer>
      <BroadcastView
        initialBroadcasts={initialBroadcasts}
        sessions={sessionOptions}
        availableTags={[...tagSet].sort()}
      />
    </PageContainer>
  )
}
