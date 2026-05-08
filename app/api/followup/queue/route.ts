// GET /api/followup/queue?tab=today|upcoming|history|blacklist
//
// Tab:
//   today     → PENDING dengan scheduledAt antara start-of-day s/d end-of-day
//   upcoming  → PENDING dengan scheduledAt > end-of-today
//   history   → FollowUpLog terbaru (gabungan SENT/FAILED) + queue terminal
//   blacklist → list FollowUpBlacklist
import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  try {
    const { session } = await requireOrderSystemAccess()
    const url = new URL(req.url)
    const tab = url.searchParams.get('tab') ?? 'today'

    if (tab === 'blacklist') {
      const items = await prisma.followUpBlacklist.findMany({
        where: { userId: session.user.id },
        orderBy: { blockedAt: 'desc' },
      })
      return jsonOk({ tab, items })
    }

    if (tab === 'history') {
      const logs = await prisma.followUpLog.findMany({
        where: { userId: session.user.id },
        orderBy: { sentAt: 'desc' },
        take: 100,
      })
      return jsonOk({ tab, items: logs })
    }

    // today / upcoming → query queue PENDING
    const now = new Date()
    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)
    const endOfToday = new Date(now)
    endOfToday.setHours(23, 59, 59, 999)

    let where = {}
    if (tab === 'today') {
      where = {
        userId: session.user.id,
        status: 'PENDING',
        scheduledAt: { gte: startOfToday, lte: endOfToday },
      }
    } else {
      // upcoming
      where = {
        userId: session.user.id,
        status: 'PENDING',
        scheduledAt: { gt: endOfToday },
      }
    }

    const items = await prisma.followUpQueue.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      take: 200,
      include: {
        template: { select: { name: true, trigger: true } },
        order: {
          select: {
            id: true,
            invoiceNumber: true,
            customerName: true,
            customerPhone: true,
            paymentStatus: true,
            deliveryStatus: true,
          },
        },
      },
    })

    return jsonOk({ tab, items })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[followup/queue GET]', e)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
