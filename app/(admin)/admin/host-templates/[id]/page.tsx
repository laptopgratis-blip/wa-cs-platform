// /admin/host-templates/[id] — agentic detail page.
// Branch berdasarkan HostTemplate.mode (sama pattern dgn user page).
import { notFound } from 'next/navigation'

import { ClipLibraryBoard } from '@/components/admin/ClipLibraryBoard'
import { HostSceneBoard } from '@/components/admin/HostSceneBoard'
import { PageContainer } from '@/components/shared/PageContainer'
import { requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function AdminHostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params

  const host = await prisma.hostTemplate.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      mode: true,
      sourceImageUrl: true,
      visionAnalysis: true,
    },
  })
  if (!host) notFound()

  if (host.mode === 'NATIVE_LIBRARY') {
    return (
      <PageContainer>
        <ClipLibraryBoard
          hostId={host.id}
          hostName={host.name}
          hostMode="NATIVE_LIBRARY"
          hasSourceImage={Boolean(host.sourceImageUrl)}
          hasVisionAnalysis={Boolean(host.visionAnalysis)}
          isAdmin={true}
          backHref="/admin/host-templates"
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <HostSceneBoard
        hostId={id}
        apiHostBase="/api/admin/host-templates"
        apiSceneBase="/api/host-templates"
        backHref="/admin/host-templates"
      />
    </PageContainer>
  )
}
