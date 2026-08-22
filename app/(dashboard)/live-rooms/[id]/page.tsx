// /live-rooms/[id] — edit room. ID di-pass ke form (load via API).
import { LiveRoomForm } from '@/components/live/LiveRoomForm'
import { PageContainer } from '@/components/shared/PageContainer'

export const dynamic = 'force-dynamic'

export default async function EditLiveRoomPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <PageContainer width="narrow">
      <LiveRoomForm mode="edit" roomId={id} />
    </PageContainer>
  )
}
