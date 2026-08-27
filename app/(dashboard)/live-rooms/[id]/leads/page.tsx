// /live-rooms/[id]/leads — list lead yang masuk via live room ini.
import { LiveLeadsList } from '@/components/live/LiveLeadsList'
import { PageContainer } from '@/components/shared/PageContainer'

export const dynamic = 'force-dynamic'

export default async function LiveLeadsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <PageContainer>
      <LiveLeadsList roomId={id} />
    </PageContainer>
  )
}
