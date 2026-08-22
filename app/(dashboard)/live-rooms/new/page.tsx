// /live-rooms/new — form bikin live room.
import { LiveRoomForm } from '@/components/live/LiveRoomForm'
import { PageContainer } from '@/components/shared/PageContainer'

export const dynamic = 'force-dynamic'

export default function NewLiveRoomPage() {
  return (
    <PageContainer width="narrow">
      <LiveRoomForm mode="create" />
    </PageContainer>
  )
}
