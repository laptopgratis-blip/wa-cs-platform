// POST /api/followup/queue/[id]/skip — set status SKIPPED (manual)
import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, { params }: Params) {
  try {
    const { session } = await requireOrderSystemAccess()
    const { id } = await params

    const item = await prisma.followUpQueue.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, status: true },
    })
    if (!item) return jsonError('Queue item tidak ditemukan', 404)
    if (item.status !== 'PENDING') {
      return jsonError(`Queue sudah ${item.status}, tidak bisa di-skip`, 400)
    }

    const updated = await prisma.followUpQueue.update({
      where: { id },
      data: { status: 'SKIPPED', failedReason: 'Skipped manually' },
    })
    return jsonOk(updated)
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[followup/queue skip]', e)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
