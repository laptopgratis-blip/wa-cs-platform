// GET /api/ebooks/stats — statistik penjualan e-book milik user.
// Per e-book: terjual (count entitlement), omzet (sum pricePaidRp),
// total download (sum downloadCount), breakdown status entitlement.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'

export async function GET() {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }
  try {
    const ebooks = await prisma.ebook.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        coverUrl: true,
        fileFormat: true,
        fileSizeBytes: true,
        maxDownloads: true,
        accessDays: true,
        isActive: true,
        product: { select: { id: true, name: true, price: true } },
      },
    })
    if (ebooks.length === 0) {
      return jsonOk({ items: [], totals: { sold: 0, revenueRp: 0, downloads: 0 } })
    }

    const ebookIds = ebooks.map((e) => e.id)
    // Satu groupBy untuk semua e-book — hindari N query per baris.
    const grouped = await prisma.ebookEntitlement.groupBy({
      by: ['ebookId', 'status'],
      where: { ebookId: { in: ebookIds } },
      _count: { _all: true },
      _sum: { pricePaidRp: true, downloadCount: true },
    })

    const items = ebooks.map((e) => {
      const rows = grouped.filter((g) => g.ebookId === e.id)
      const sold = rows.reduce((s, g) => s + g._count._all, 0)
      const revenueRp = rows.reduce(
        (s, g) => s + (g._sum.pricePaidRp ?? 0),
        0,
      )
      const downloads = rows.reduce(
        (s, g) => s + (g._sum.downloadCount ?? 0),
        0,
      )
      const byStatus = Object.fromEntries(
        rows.map((g) => [g.status, g._count._all]),
      )
      return {
        ...e,
        stats: {
          sold,
          revenueRp,
          downloads,
          active: byStatus.ACTIVE ?? 0,
          revoked: byStatus.REVOKED ?? 0,
          expired: byStatus.EXPIRED ?? 0,
        },
      }
    })

    return jsonOk({
      items,
      totals: {
        sold: items.reduce((s, i) => s + i.stats.sold, 0),
        revenueRp: items.reduce((s, i) => s + i.stats.revenueRp, 0),
        downloads: items.reduce((s, i) => s + i.stats.downloads, 0),
      },
    })
  } catch (err) {
    console.error('[GET /api/ebooks/stats] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
