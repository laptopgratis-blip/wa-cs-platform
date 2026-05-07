// GET /api/orders/pixels-preview?slug=... (PUBLIC, no-auth)
// Return list pixel yang aktif untuk public order form. Tidak expose
// accessToken / server-side detail — hanya {platform, pixelId} yang aman
// di-load di browser.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const slug = url.searchParams.get('slug') ?? ''
  if (!slug) return jsonError('Slug form wajib', 400)

  const form = await prisma.orderForm.findUnique({
    where: { slug },
    select: {
      isActive: true,
      enabledPixelIds: true,
    },
  })
  if (!form || !form.isActive) {
    return jsonError('Form tidak ditemukan', 404)
  }
  if (form.enabledPixelIds.length === 0) {
    return jsonOk({ items: [] })
  }

  // Hanya pixel yg user aktifkan untuk form INI + yang isActive di-platform.
  const pixels = await prisma.pixelIntegration.findMany({
    where: {
      id: { in: form.enabledPixelIds },
      isActive: true,
    },
    select: {
      id: true,
      platform: true,
      pixelId: true,
    },
  })
  return jsonOk({ items: pixels })
}
