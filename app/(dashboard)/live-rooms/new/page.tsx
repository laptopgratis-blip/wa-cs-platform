// /live-rooms/new — form bikin live room.
import { LiveRoomForm } from '@/components/live/LiveRoomForm'

export const dynamic = 'force-dynamic'

export default function NewLiveRoomPage() {
  return (
    <div className="mx-auto h-full max-w-3xl overflow-y-auto p-4 md:p-6">
      <LiveRoomForm mode="create" />
    </div>
  )
}
