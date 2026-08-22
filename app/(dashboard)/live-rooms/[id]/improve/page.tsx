// /live-rooms/[id]/improve — Fase 4 brief, AI proposals + approval.
import { ImprovementBoard } from '@/components/live/ImprovementBoard'
import { PageContainer } from '@/components/shared/PageContainer'

export const dynamic = 'force-dynamic'

export default async function ImprovementPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <PageContainer>
      <ImprovementBoard roomId={id} />
    </PageContainer>
  )
}
