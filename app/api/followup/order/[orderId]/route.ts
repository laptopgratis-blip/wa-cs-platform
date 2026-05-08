// GET /api/followup/order/[orderId]
// Return: { queue: FollowUpQueue[], logs: FollowUpLog[] } untuk satu order.
// Dipakai OrderDetailDialog untuk render section "Riwayat & Jadwal Follow-Up".
import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ orderId: string }>
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { session } = await requireOrderSystemAccess()
    const { orderId } = await params

    const order = await prisma.userOrder.findFirst({
      where: { id: orderId, userId: session.user.id },
      select: { id: true },
    })
    if (!order) return jsonError('Order tidak ditemukan', 404)

    const [queue, logs] = await Promise.all([
      prisma.followUpQueue.findMany({
        where: { orderId },
        orderBy: { scheduledAt: 'asc' },
        include: { template: { select: { name: true, trigger: true } } },
      }),
      prisma.followUpLog.findMany({
        where: { orderId },
        orderBy: { sentAt: 'desc' },
        take: 30,
      }),
    ])

    return jsonOk({ queue, logs })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[followup/order GET]', e)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
