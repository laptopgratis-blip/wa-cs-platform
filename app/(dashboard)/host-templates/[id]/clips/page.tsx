// /host-templates/[id]/clips — Klip Live library manager.
// Pre-req: HostTemplate.mode = NATIVE_LIBRARY + sourceImage + visionAnalysis.

import { notFound } from 'next/navigation'

import { ClipLibraryBoard } from '@/components/admin/ClipLibraryBoard'
import { requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function HostClipsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireSession()
  const { id } = await params

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
  // Owner atau admin only
  if (session.user.role !== 'ADMIN' && host.userId !== session.user.id) {
    notFound()
  }

  return (
    <div className="mx-auto h-full max-w-5xl overflow-y-auto p-4 md:p-6">
      <ClipLibraryBoard
        hostId={host.id}
        hostName={host.name}
        hostMode={host.mode as 'TTS_GENERATIVE' | 'NATIVE_LIBRARY'}
        hasSourceImage={Boolean(host.sourceImageUrl)}
        hasVisionAnalysis={Boolean(host.visionAnalysis)}
        isAdmin={session.user.role === 'ADMIN'}
        backHref={`/host-templates/${host.id}`}
      />
    </div>
  )
}
