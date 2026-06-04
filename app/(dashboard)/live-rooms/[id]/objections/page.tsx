// /live-rooms/[id]/objections — peta objection per kategori (Fase 3 brief).
import { ObjectionMap } from '@/components/live/ObjectionMap'

export const dynamic = 'force-dynamic'

export default async function ObjectionsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div className="mx-auto h-full max-w-5xl overflow-y-auto p-4 md:p-6">
      <ObjectionMap roomId={id} />
    </div>
  )
}
