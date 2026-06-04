// /live-rooms/[id]/improve — Fase 4 brief, AI proposals + approval.
import { ImprovementBoard } from '@/components/live/ImprovementBoard'

export const dynamic = 'force-dynamic'

export default async function ImprovementPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div className="mx-auto h-full max-w-5xl overflow-y-auto p-4 md:p-6">
      <ImprovementBoard roomId={id} />
    </div>
  )
}
