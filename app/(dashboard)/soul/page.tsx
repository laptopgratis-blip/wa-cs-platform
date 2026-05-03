// Halaman /soul — list soul milik user.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { SoulList, type SoulListItem } from '@/components/soul/SoulList'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Language, Personality, ReplyStyle } from '@/lib/soul'

export const dynamic = 'force-dynamic'

export default async function SoulPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const rows = await prisma.soul.findMany({
    where: { userId: session.user.id },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      name: true,
      personality: true,
      language: true,
      replyStyle: true,
      businessContext: true,
      isDefault: true,
      _count: { select: { waSessions: true } },
    },
  })

  const souls: SoulListItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    personality: r.personality as Personality | null,
    language: (r.language || 'id') as Language,
    replyStyle: r.replyStyle as ReplyStyle | null,
    businessContext: r.businessContext,
    isDefault: r.isDefault,
    usageCount: r._count.waSessions,
  }))

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 overflow-y-auto p-4 md:p-6">
      <SoulList souls={souls} />
    </div>
  )
}
