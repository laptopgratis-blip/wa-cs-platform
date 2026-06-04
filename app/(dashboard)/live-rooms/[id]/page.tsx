// /live-rooms/[id] — edit room. ID di-pass ke form (load via API).
import { LiveRoomForm } from '@/components/live/LiveRoomForm'

export const dynamic = 'force-dynamic'

export default async function EditLiveRoomPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div className="mx-auto h-full max-w-3xl overflow-y-auto p-4 md:p-6">
      <LiveRoomForm mode="edit" roomId={id} />
    </div>
  )
}
