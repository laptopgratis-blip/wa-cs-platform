// GET /api/lp-embed/[lpId] — public read config untuk widget loader.
// Dipakai oleh /hulao-live-embed.js untuk tahu mode, slug live room, posisi, dll.
// Tidak butuh auth — semua fieldnya public-safe (slug, gate config).
import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ lpId: string }>
}

export async function GET(_req: Request, { params }: Params) {
  const { lpId } = await params

  const embed = await prisma.lpLiveEmbed.findUnique({
    where: { landingPageId: lpId },
    include: {
      liveRoom: {
        select: {
          slug: true,
          name: true,
          isActive: true,
          hostTemplate: { select: { mode: true } },
        },
      },
      landingPage: {
        select: { isPublished: true },
      },
    },
  })

  if (!embed || !embed.isActive || !embed.liveRoom.isActive || !embed.landingPage.isPublished) {
    return NextResponse.json({ active: false }, {
      status: 200,
      headers: { 'Cache-Control': 'public, max-age=60' },
    })
  }

  return NextResponse.json(
    {
      active: true,
      liveSlug: embed.liveRoom.slug,
      liveName: embed.liveRoom.name,
      hostMode: embed.liveRoom.hostTemplate.mode,
      gateMode: embed.gateMode,
      gateFields: embed.gateFields,
      gateTriggerSec: embed.gateTriggerSec,
      gateTriggerOnChat: embed.gateTriggerOnChat,
      ctaLabel: embed.ctaLabel,
      position: embed.position,
      autoplay: embed.autoplay,
      mutedDefault: embed.mutedDefault,
      widthPx: embed.widthPx,
      heightPx: embed.heightPx,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=300',
        // Embedable cross-origin — biar widget bisa di-load dari LP custom domain nanti.
        'Access-Control-Allow-Origin': '*',
      },
    },
  )
}
