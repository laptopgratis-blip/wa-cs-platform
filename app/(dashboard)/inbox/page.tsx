// Halaman /inbox — split panel (list + chat).
// Server component fetch data awal, sisanya di-handle InboxView (client).
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { InboxView } from '@/components/inbox/InboxView'
import type {
  InboxConversation,
  InboxCounts,
  MessageSource,
} from '@/components/inbox/types'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function InboxPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const userId = session.user.id

  const [contacts, allCount, aiCount, attentionCount, resolvedCount] =
    await Promise.all([
      prisma.contact.findMany({
        where: { userId, messages: { some: {} } },
        orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
        take: 100,
        select: {
          id: true,
          phoneNumber: true,
          name: true,
          avatar: true,
          tags: true,
          pipelineStage: true,
          aiPaused: true,
          isResolved: true,
          lastMessageAt: true,
          waSession: { select: { id: true, displayName: true, phoneNumber: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { content: true, role: true, source: true, createdAt: true },
          },
        },
      }),
      prisma.contact.count({ where: { userId, messages: { some: {} } } }),
      prisma.contact.count({
        where: { userId, messages: { some: {} }, aiPaused: false, isResolved: false },
      }),
      prisma.contact.count({
        where: { userId, messages: { some: {} }, aiPaused: true, isResolved: false },
      }),
      prisma.contact.count({
        where: { userId, messages: { some: {} }, isResolved: true },
      }),
    ])

  const conversations: InboxConversation[] = contacts.map((c) => ({
    id: c.id,
    phoneNumber: c.phoneNumber,
    name: c.name,
    avatar: c.avatar,
    tags: c.tags,
    pipelineStage: c.pipelineStage,
    aiPaused: c.aiPaused,
    isResolved: c.isResolved,
    lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
    waSession: c.waSession,
    lastMessage: c.messages[0]
      ? {
          content: c.messages[0].content,
          role: c.messages[0].role,
          source: (c.messages[0].source ?? null) as MessageSource | null,
          createdAt: c.messages[0].createdAt.toISOString(),
        }
      : null,
  }))

  const counts: InboxCounts = {
    all: allCount,
    ai: aiCount,
    attention: attentionCount,
    resolved: resolvedCount,
  }

  return <InboxView initialConversations={conversations} initialCounts={counts} />
}
