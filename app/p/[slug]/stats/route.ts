// GET /p/[slug]/stats — return viewCount publik untuk LP.
// Dipakai future analytics widget. Tidak butuh auth — toh viewCount sudah
// implicit eksposed via insting & cache headers.
import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ slug: string }>
}

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params

  try {
    const lp = await prisma.landingPage.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        viewCount: true,
        isPublished: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    if (!lp || !lp.isPublished) {
      return NextResponse.json(
        { success: false, error: 'LP tidak ditemukan atau belum dipublish' },
        { status: 404 },
      )
    }
    return NextResponse.json({
      success: true,
      data: {
        slug: lp.slug,
        viewCount: lp.viewCount,
        createdAt: lp.createdAt.toISOString(),
        updatedAt: lp.updatedAt.toISOString(),
      },
    })
  } catch (err) {
    console.error('[/p/:slug/stats] gagal:', err)
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan server' },
      { status: 500 },
    )
  }
}
