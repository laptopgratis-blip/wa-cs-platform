// Halaman /contacts — list semua kontak user dengan filter & search.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { ContactsView } from '@/components/contacts/ContactsView'
import type { ContactRow } from '@/components/contacts/types'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function ContactsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const userId = session.user.id

  const [contacts, total, allContacts] = await Promise.all([
    prisma.contact.findMany({
      where: { userId },
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      select: {
        id: true,
        phoneNumber: true,
        name: true,
        avatar: true,
        tags: true,
        pipelineStage: true,
        isBlacklisted: true,
        aiPaused: true,
        isResolved: true,
        lastMessageAt: true,
        createdAt: true,
      },
    }),
    prisma.contact.count({ where: { userId } }),
    prisma.contact.findMany({
      where: { userId },
      select: { tags: true },
      take: 500,
    }),
  ])

  const tagSet = new Set<string>()
  for (const c of allContacts) for (const t of c.tags) tagSet.add(t)

  const initialContacts: ContactRow[] = contacts.map((c) => ({
    id: c.id,
    phoneNumber: c.phoneNumber,
    name: c.name,
    avatar: c.avatar,
    tags: c.tags,
    pipelineStage: c.pipelineStage,
    isBlacklisted: c.isBlacklisted,
    aiPaused: c.aiPaused,
    isResolved: c.isResolved,
    lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  }))

  return (
    <div className="mx-auto h-full max-w-7xl overflow-y-auto p-4 md:p-6">
      <ContactsView
        initialContacts={initialContacts}
        initialTags={[...tagSet].sort()}
        initialTotal={total}
      />
    </div>
  )
}
