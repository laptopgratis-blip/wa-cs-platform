// Halaman /whatsapp/templates — kelola template Meta untuk nomor Cloud API
// (Trek 2B). Tanpa sesi Cloud API → empty state arahkan ke /whatsapp.
import { LayoutTemplate } from 'lucide-react'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
    where: { userId: session.user.id, provider: 'CLOUD_API', isActive: true, wabaId: { not: null } },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    select: { id: true, displayName: true, phoneNumber: true, wabaId: true, status: true },
  })

  if (sessions.length === 0) {
    return (
      <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-6 overflow-y-auto p-4 md:p-6">
        <PageHeader
          icon={LayoutTemplate}
          title="Template Meta"
          description="Template pesan untuk nomor WhatsApp resmi (Cloud API)."
        />
        <Card>
          <CardContent className="py-10">
            <EmptyState
              icon={LayoutTemplate}
              title="Belum ada nomor Cloud API"
              description="Template Meta hanya untuk nomor yang terhubung via WhatsApp Business API resmi. Hubungkan dulu di menu WhatsApp → Hubungkan WhatsApp Business API."
            />
            <div className="mt-4 flex justify-center">
              <Button asChild><Link href="/whatsapp">Ke menu WhatsApp</Link></Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const initial = sessions.find((s) => s.id === sessionParam)?.id ?? sessions[0]?.id ?? null

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-6 overflow-y-auto p-4 md:p-6">
      <Suspense fallback={null}>
        <WabaTemplatesClient sessions={sessions} initialSessionId={initial} />
      </Suspense>
    </div>
  )
}
