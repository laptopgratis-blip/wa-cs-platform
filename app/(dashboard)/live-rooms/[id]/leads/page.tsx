// /live-rooms/[id]/leads — list lead yang masuk via live room ini.
import { LiveLeadsList } from '@/components/live/LiveLeadsList'

export const dynamic = 'force-dynamic'

export default async function LiveLeadsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div className="mx-auto h-full max-w-5xl overflow-y-auto p-4 md:p-6">
      <LiveLeadsList roomId={id} />
    </div>
  )
}
