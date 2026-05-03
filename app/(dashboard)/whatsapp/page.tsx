// Halaman /whatsapp — list semua WA session milik user, lengkap dengan
// pilihan Soul & Model untuk masing-masing session.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { WhatsappList } from '@/components/whatsapp/WhatsappList'
import type {
  AiModelOption,
  SoulOption,
  WaSessionData,
} from '@/components/whatsapp/WaSessionCard'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function WhatsappPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const [waRows, soulRows, modelRows] = await Promise.all([
    prisma.whatsappSession.findMany({
      where: { userId: session.user.id, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        phoneNumber: true,
        displayName: true,
        status: true,
        createdAt: true,
        soulId: true,
        modelId: true,
      },
    }),
    prisma.soul.findMany({
      where: { userId: session.user.id },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, isDefault: true },
    }),
    prisma.aiModel.findMany({
      where: { isActive: true },
      orderBy: { costPerMessage: 'asc' },
      select: { id: true, name: true, costPerMessage: true },
    }),
  ])

  const sessions: WaSessionData[] = waRows.map((r) => ({
    id: r.id,
    phoneNumber: r.phoneNumber,
    displayName: r.displayName,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    soulId: r.soulId,
    modelId: r.modelId,
  }))

  const souls: SoulOption[] = soulRows
  const models: AiModelOption[] = modelRows

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 overflow-y-auto p-4 md:p-6">
      <WhatsappList sessions={sessions} souls={souls} models={models} />
    </div>
  )
}
