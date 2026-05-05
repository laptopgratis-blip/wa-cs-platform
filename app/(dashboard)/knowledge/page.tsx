// Halaman /knowledge — list pengetahuan bisnis user.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import {
  KnowledgeList,
  type KnowledgeListItem,
} from '@/components/knowledge/KnowledgeList'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { KNOWLEDGE_LIMIT_PER_USER } from '@/lib/validations/knowledge'

export const dynamic = 'force-dynamic'

export default async function KnowledgePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const rows = await prisma.userKnowledge.findMany({
    where: { userId: session.user.id },
    orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      title: true,
      contentType: true,
      textContent: true,
      fileUrl: true,
      linkUrl: true,
      caption: true,
      triggerKeywords: true,
      isActive: true,
      triggerCount: true,
      lastTriggeredAt: true,
    },
  })

  const items: KnowledgeListItem[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    contentType: r.contentType as KnowledgeListItem['contentType'],
    textContent: r.textContent,
    fileUrl: r.fileUrl,
    linkUrl: r.linkUrl,
    caption: r.caption,
    triggerKeywords: r.triggerKeywords,
    isActive: r.isActive,
    triggerCount: r.triggerCount,
    lastTriggeredAt: r.lastTriggeredAt?.toISOString() ?? null,
  }))

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 overflow-y-auto p-4 md:p-6">
      <KnowledgeList items={items} limit={KNOWLEDGE_LIMIT_PER_USER} />
    </div>
  )
}
