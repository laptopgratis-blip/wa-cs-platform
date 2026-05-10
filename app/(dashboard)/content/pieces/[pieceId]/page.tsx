// /content/pieces/[pieceId] — detail piece + edit + copy.
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { PieceDetailClient } from '@/components/content/PieceDetailClient'
import { Button } from '@/components/ui/button'
import { authOptions } from '@/lib/auth'
import { getPieceForOwner } from '@/lib/services/content/library'

interface Params {
  params: Promise<{ pieceId: string }>
}

export const dynamic = 'force-dynamic'

export default async function PieceDetailPage({ params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { pieceId } = await params
  const piece = await getPieceForOwner(session.user.id, pieceId)
  if (!piece) notFound()

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 overflow-y-auto p-4 md:p-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 self-start">
        <Link href="/content?tab=library">
          <ArrowLeft className="mr-2 size-4" />
          Kembali ke Library
        </Link>
      </Button>

      <PieceDetailClient
        piece={{
          id: piece.id,
          title: piece.title,
          channel: piece.channel,
          funnelStage: piece.funnelStage,
          format: piece.format,
          status: piece.status,
          tokensCharged: piece.tokensCharged,
          scheduledFor: piece.scheduledFor?.toISOString() ?? null,
          pieceType: piece.pieceType,
          adsPlatform: piece.adsPlatform,
          adsFormat: piece.adsFormat,
          metrics: {
            reach: piece.reach,
            impressions: piece.impressions,
            saves: piece.saves,
            shares: piece.shares,
            comments: piece.comments,
            dms: piece.dms,
            linkClicks: piece.linkClicks,
            metricUpdatedAt: piece.metricUpdatedAt?.toISOString() ?? null,
          },
          bodyJson: piece.bodyJson as Record<string, unknown>,
          slides: piece.slides.map((s) => ({
            id: s.id,
            slideIndex: s.slideIndex,
            headline: s.headline,
            body: s.body,
          })),
          variants: piece.variants.map((v) => ({
            id: v.id,
            variantType: v.variantType,
            value: v.value,
            order: v.order,
            impressions: v.impressions,
            clicks: v.clicks,
            ctr: v.ctr,
            conversions: v.conversions,
            spendRp: v.spendRp,
          })),
          sourceIdea: piece.sourceIdea
            ? {
                method: piece.sourceIdea.method,
                hook: piece.sourceIdea.hook,
                whyItWorks: piece.sourceIdea.whyItWorks,
              }
            : null,
          brief: piece.brief
            ? {
                lpTitle: piece.brief.lp?.title ?? null,
                lpSlug: piece.brief.lp?.slug ?? null,
                manualTitle: piece.brief.manualTitle ?? null,
              }
            : null,
        }}
      />
    </div>
  )
}
