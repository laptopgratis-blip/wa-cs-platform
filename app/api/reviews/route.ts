// GET /api/reviews?filter=all|approved|pending
// List testimoni milik user (owner). POWER only.
import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  try {
    const { session } = await requireOrderSystemAccess()
    const filter = new URL(req.url).searchParams.get('filter') ?? 'all'

    const where: { userId: string; approved?: boolean } = {
      userId: session.user.id,
    }
    if (filter === 'approved') where.approved = true
    else if (filter === 'pending') where.approved = false

    const items = await prisma.orderReview.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 300,
    })

    const stats = {
      total: await prisma.orderReview.count({ where: { userId: session.user.id } }),
      approved: await prisma.orderReview.count({
        where: { userId: session.user.id, approved: true },
      }),
      avgRating: 0,
    }
    const agg = await prisma.orderReview.aggregate({
      where: { userId: session.user.id },
      _avg: { rating: true },
    })
    stats.avgRating = Math.round((agg._avg.rating ?? 0) * 10) / 10

    return jsonOk({ items, stats })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[reviews GET]', e)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
