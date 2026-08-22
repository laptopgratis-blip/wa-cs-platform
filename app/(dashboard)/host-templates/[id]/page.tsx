// /host-templates/[id] — user-side host detail.
// Branch berdasarkan HostTemplate.mode:
//   TTS_GENERATIVE: HostSceneBoard (scenes manager existing)
//   NATIVE_LIBRARY: ClipLibraryBoard (Klip Live library — orchestrator script)
import { notFound } from 'next/navigation'

import { ClipLibraryBoard } from '@/components/admin/ClipLibraryBoard'
import { HostSceneBoard } from '@/components/admin/HostSceneBoard'
import { PageContainer } from '@/components/shared/PageContainer'
import { requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function UserHostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireSession()
  const { id } = await params

  // Quick fetch untuk routing decision — branch UI berdasarkan mode.
  const host = await prisma.hostTemplate.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      name: true,
      mode: true,
      sourceImageUrl: true,
      visionAnalysis: true,
    },
  })
  if (!host) notFound()
  if (session.user.role !== 'ADMIN' && host.userId !== session.user.id) {
    notFound()
  }

  if (host.mode === 'NATIVE_LIBRARY') {
    return (
      <PageContainer>
        <ClipLibraryBoard
          hostId={host.id}
          hostName={host.name}
          hostMode="NATIVE_LIBRARY"
          hasSourceImage={Boolean(host.sourceImageUrl)}
          hasVisionAnalysis={Boolean(host.visionAnalysis)}
          isAdmin={session.user.role === 'ADMIN'}
          backHref="/host-templates"
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <HostSceneBoard
        hostId={id}
        apiHostBase="/api/host-templates"
        apiSceneBase="/api/host-templates"
        backHref="/host-templates"
      />
    </PageContainer>
  )
}
