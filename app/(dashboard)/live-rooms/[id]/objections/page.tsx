// /live-rooms/[id]/objections — peta objection per kategori (Fase 3 brief).
import { ObjectionMap } from '@/components/live/ObjectionMap'
import { PageContainer } from '@/components/shared/PageContainer'

export const dynamic = 'force-dynamic'

export default async function ObjectionsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <PageContainer>
      <ObjectionMap roomId={id} />
    </PageContainer>
  )
}
