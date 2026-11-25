import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { MetaTemplateBanner } from '@/components/followup/MetaTemplateBanner'
import { TemplatesClient } from '@/components/followup/TemplatesClient'
import { UpgradeRequired } from '@/components/order-system/UpgradeRequired'
import { PageContainer } from '@/components/shared/PageContainer'
import { authOptions } from '@/lib/auth'
import { checkOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import { buildFollowUpSenderOptions } from '@/lib/services/followup-sender-options'

export const dynamic = 'force-dynamic'


export const metadata = {
  title: 'Template Follow-Up · Hulao',
}

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ highlight?: string | string[] }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const access = await checkOrderSystemAccess(session.user.id)
  if (!access.hasAccess) {
    return (
      <UpgradeRequired
        currentTier={access.currentTier}
        feature="Template Follow-Up"
      />
    )
  }

  // ?highlight=<id> dari notifikasi follow-up gagal kirim.
  const { highlight } = await searchParams

  // Forms untuk dropdown scope=FORM + sesi Cloud API (untuk banner template
  // Meta & pemilih Template Meta di modal — hasCloud).
  const [forms, cloudSessions, pinnedSenders] = await Promise.all([
    prisma.orderForm.findMany({
      where: { userId: session.user.id, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.whatsappSession.findMany({
      where: {
        userId: session.user.id,
        provider: 'CLOUD_API',
        isActive: true,
        wabaId: { not: null },
      },
      select: { id: true, displayName: true, phoneNumber: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.followUpTemplate.findMany({
      where: { userId: session.user.id, senderSessionId: { not: null } },
      select: { senderSessionId: true },
      distinct: ['senderSessionId'],
    }),
  ])

  // Opsi "Kirim dari": pola yang sama dengan "CS WhatsApp" di /products —
  // nomor yang masih terdaftar (status apa pun, offline tetap bisa dipilih)
  // + sesi yang sedang dipakai template walau sudah dihapus. Pengelompokan
  // per nomor + wabaId: lib/services/followup-sender-options.ts.
  const senderIdsInUse = pinnedSenders.flatMap((t) =>
    t.senderSessionId ? [t.senderSessionId] : [],
  )
  const senderRows = await prisma.whatsappSession.findMany({
    where: {
      userId: session.user.id,
      phoneNumber: { not: null },
      OR: [{ isActive: true }, { id: { in: senderIdsInUse } }],
    },
    select: {
      id: true,
      displayName: true,
      phoneNumber: true,
      provider: true,
      status: true,
      isActive: true,
      wabaId: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  })
  const senderOptions = buildFollowUpSenderOptions(senderRows, senderIdsInUse)

  // Container halaman dipegang di sini (bukan di TemplatesClient) supaya banner
  // template Meta + isi klien berbagi satu wrapper — tidak dobel padding.
  return (
    <PageContainer>
      {cloudSessions.length > 0 && (
        <MetaTemplateBanner sessions={cloudSessions} />
      )}
      <TemplatesClient
        forms={forms}
        hasCloud={cloudSessions.length > 0}
        senderOptions={senderOptions}
        highlightId={typeof highlight === 'string' ? highlight : null}
      />
    </PageContainer>
  )
}
