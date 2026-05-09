// GET /api/lp/[lpId]/heatmap?device=DESKTOP|MOBILE|TABLET
// Return heatmap bin data untuk render di overlay LP preview.
// Response: { device, bins: [{x, y, count}], maxCount }
// Frontend pakai heatmap.js render dot per bin.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ lpId: string }>
}

const ALLOWED_DEVICES = new Set(['MOBILE', 'TABLET', 'DESKTOP'])

export async function GET(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { lpId } = await params

  const lp = await prisma.landingPage.findUnique({
    where: { id: lpId },
    select: {
      userId: true,
      slug: true,
      user: { select: { lpQuota: { select: { tier: true } } } },
    },
  })
  if (!lp) return jsonError('LP tidak ditemukan', 404)
  if (lp.userId !== session.user.id) return jsonError('Forbidden', 403)
  if ((lp.user.lpQuota?.tier ?? 'FREE') !== 'POWER') {
    return jsonError('Heatmap eksklusif POWER plan', 403)
  }

  const url = new URL(req.url)
  const deviceParam = (url.searchParams.get('device') ?? 'DESKTOP').toUpperCase()
  if (!ALLOWED_DEVICES.has(deviceParam)) {
    return jsonError('Device tidak valid', 400)
  }

  try {
    const bins = await prisma.lpHeatmapBin.findMany({
      where: { landingPageId: lpId, deviceType: deviceParam },
      select: { xCell: true, yCell: true, count: true },
    })

    const maxCount = bins.reduce((m, b) => (b.count > m ? b.count : m), 0)
    const totalClicks = bins.reduce((s, b) => s + b.count, 0)

    return jsonOk({
      slug: lp.slug,
      device: deviceParam,
      bins: bins.map((b) => ({ x: b.xCell, y: b.yCell, count: b.count })),
      maxCount,
      totalClicks,
    })
  } catch (err) {
    console.error('[GET /api/lp/:id/heatmap] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
