// /live-rooms — list room user + tombol bikin baru.
import { LiveRoomsList } from '@/components/live/LiveRoomsList'

export const dynamic = 'force-dynamic'

export default function LiveRoomsPage() {
  return (
    <div className="mx-auto h-full max-w-6xl overflow-y-auto p-4 md:p-6">
      <LiveRoomsList />
    </div>
  )
}
