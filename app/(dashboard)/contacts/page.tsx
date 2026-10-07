// Halaman /contacts — list semua kontak user dengan filter & search, plus
// impor kontak (CSV / tempel spreadsheet) ke salah satu nomor WA aktif.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { ContactsView } from '@/components/contacts/ContactsView'
import type { ContactRow, ImportSessionOption } from '@/components/contacts/types'
import { PageContainer } from '@/components/shared/PageContainer'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { listContactTags } from '@/lib/services/contacts/tags'

export const dynamic = 'force-dynamic'

export default async function ContactsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const userId = session.user.id

  const [contacts, total, tags, sessions] = await Promise.all([
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
    listContactTags(userId),
    prisma.whatsappSession.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true, displayName: true, phoneNumber: true, provider: true, status: true },
    }),
  ])

  const importSessions: ImportSessionOption[] = sessions

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
    <PageContainer width="wide">
      <ContactsView
        initialContacts={initialContacts}
        initialTags={tags}
        initialTotal={total}
        importSessions={importSessions}
      />
    </PageContainer>
  )
}
