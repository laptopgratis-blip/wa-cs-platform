// PATCH /api/followup/queue/[id] — edit resolvedMessage (untuk override sebelum send)
import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import { followupQueueEditSchema } from '@/lib/validations/followup'

interface Params {
  params: Promise<{ id: string }>
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { session } = await requireOrderSystemAccess()
    const { id } = await params

    const item = await prisma.followUpQueue.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, status: true },
    })
    if (!item) return jsonError('Queue item tidak ditemukan', 404)
    if (item.status !== 'PENDING') {
      return jsonError(`Queue sudah ${item.status}, tidak bisa diedit`, 400)
    }

    const body = await req.json().catch(() => ({}))
    const parsed = followupQueueEditSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'Invalid input', 400)
    }

    const updated = await prisma.followUpQueue.update({
      where: { id },
      data: { resolvedMessage: parsed.data.resolvedMessage },
    })
    return jsonOk(updated)
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[followup/queue PATCH]', e)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
