// GET /api/host-presets — list semua BackgroundPreset + VisualHookPreset aktif.
// Dipakai oleh wizard Klip Live (step 2 hook + step 3 background).
//
// No auth — preset = public catalog. Cache 5 menit via headers.

import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [backgrounds, hooks] = await Promise.all([
    prisma.backgroundPreset.findMany({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
      select: {
        id: true,
        slug: true,
        category: true,
        nameId: true,
        nameEn: true,
        description: true,
        thumbnailUrl: true,
        vibeTags: true,
      },
    }),
    prisma.visualHookPreset.findMany({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
      select: {
        id: true,
        slug: true,
        category: true,
        nameId: true,
        description: true,
        thumbnailUrl: true,
        vibeTags: true,
        cautionFlags: true,
      },
    }),
  ])

  return NextResponse.json(
    { success: true, data: { backgrounds, hooks } },
    {
      status: 200,
      headers: {
        'cache-control': 'public, max-age=300, stale-while-revalidate=600',
      },
    },
  )
}
