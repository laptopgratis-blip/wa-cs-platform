// /live-rooms — list room user + tombol bikin baru.
import { LiveRoomsList } from '@/components/live/LiveRoomsList'
import { PageContainer } from '@/components/shared/PageContainer'

export const dynamic = 'force-dynamic'

export default function LiveRoomsPage() {
  return (
    <PageContainer>
      <LiveRoomsList />
    </PageContainer>
  )
}
