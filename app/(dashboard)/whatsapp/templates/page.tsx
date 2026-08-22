// Halaman /whatsapp/templates — kelola template Meta untuk nomor Cloud API
// (Trek 2B). Tanpa sesi Cloud API → empty state arahkan ke /whatsapp.
import { LayoutTemplate } from 'lucide-react'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import { EmptyState } from '@/components/shared/EmptyState'
import { PageContainer } from '@/components/shared/PageContainer'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { WabaTemplatesClient } from '@/components/waba-templates/WabaTemplatesClient'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function WabaTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const { session: sessionParam } = await searchParams

  const sessions = await prisma.whatsappSession.findMany({
    where: {
      userId: session.user.id,
      provider: 'CLOUD_API',
      isActive: true,
      wabaId: { not: null },
    },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      displayName: true,
      phoneNumber: true,
      wabaId: true,
      status: true,
    },
  })

  if (sessions.length === 0) {
    return (
      <PageContainer>
        <PageHeader
          icon={LayoutTemplate}
          title="Template Meta"
          description="Template pesan untuk nomor WhatsApp resmi (Cloud API)."
        />
        <EmptyState
          bordered
          icon={LayoutTemplate}
          title="Belum ada nomor Cloud API"
          description="Template Meta hanya untuk nomor yang terhubung via WhatsApp Business API resmi. Hubungkan dulu di menu WhatsApp → Hubungkan WhatsApp Business API."
          action={
            <Button asChild>
              <Link href="/whatsapp">Ke menu WhatsApp</Link>
            </Button>
          }
        />
      </PageContainer>
    )
  }

  const initial =
    sessions.find((s) => s.id === sessionParam)?.id ?? sessions[0]?.id ?? null

  return (
    <PageContainer>
      <Suspense fallback={null}>
        <WabaTemplatesClient sessions={sessions} initialSessionId={initial} />
      </Suspense>
    </PageContainer>
  )
}
