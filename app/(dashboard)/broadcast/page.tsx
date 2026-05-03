// Halaman /broadcast — form + list.
import type { PipelineStage } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { BroadcastView } from '@/components/broadcast/BroadcastView'
import type {
  BroadcastListItem,
  SessionOption,
} from '@/components/broadcast/types'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
      select: {
        id: true,
        name: true,
        message: true,
        targetTags: true,
        targetStages: true,
        status: true,
        scheduledAt: true,
        startedAt: true,
        completedAt: true,
        totalTargets: true,
        totalSent: true,
        totalFailed: true,
        createdAt: true,
        waSession: { select: { id: true, displayName: true, phoneNumber: true } },
      },
    }),
    prisma.whatsappSession.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true, displayName: true, phoneNumber: true, status: true },
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
    id: b.id,
    name: b.name,
    message: b.message,
    targetTags: b.targetTags,
    targetStages: b.targetStages as PipelineStage[],
    status: b.status,
    scheduledAt: b.scheduledAt?.toISOString() ?? null,
    startedAt: b.startedAt?.toISOString() ?? null,
    completedAt: b.completedAt?.toISOString() ?? null,
    totalTargets: b.totalTargets,
    totalSent: b.totalSent,
    totalFailed: b.totalFailed,
    createdAt: b.createdAt.toISOString(),
    waSession: b.waSession,
  }))

  const sessionOptions: SessionOption[] = sessions

  return (
    <div className="mx-auto h-full max-w-6xl overflow-y-auto p-4 md:p-6">
      <BroadcastView
        initialBroadcasts={initialBroadcasts}
        sessions={sessionOptions}
        availableTags={[...tagSet].sort()}
      />
    </div>
  )
}
