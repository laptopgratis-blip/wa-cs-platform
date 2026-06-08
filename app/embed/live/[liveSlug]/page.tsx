// /embed/live/[liveSlug] — iframe content untuk LP × Live AI Embed.
// Dipanggil dari /hulao-live-embed.js (widget JS). Query string:
//   ?lpId=<lpId>           wajib — untuk lookup config & attribusi
//
// Halaman ini fetch config dari LpLiveEmbed (via lpId), lalu render
// LiveEmbedView (LiveRoomView yg dibungkus gate modal sesuai gateMode).
//
// Beda dari /live/[slug]:
// - Wrapped dalam gate flow (REQUIRED/OPTIONAL/HYBRID/OFF)
// - Layout iframe-friendly (no header/footer/sidebar)
// - Background transparent supaya menyatu dgn LP host
import type { Viewport } from 'next'
import { notFound } from 'next/navigation'

import { LiveEmbedView } from '@/components/live/LiveEmbedView'
import { prisma } from '@/lib/prisma'
import { resolveLiveOrderFormSlug } from '@/lib/services/live/order-form'

export const dynamic = 'force-dynamic'

// Embed live = full-screen di dalam iframe. Kunci skala agar pinch/double-tap
// tidak menggeser/membesarkan tampilan di mobile.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

interface PageProps {
  params: Promise<{ liveSlug: string }>
  searchParams: Promise<{ lpId?: string }>
}

export default async function LiveEmbedPage({ params, searchParams }: PageProps) {
  const { liveSlug } = await params
  const { lpId } = await searchParams

  if (!lpId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black p-6 text-center text-white">
        <div>
          <div className="text-3xl">⚠️</div>
          <p className="mt-3 text-sm text-zinc-300">Parameter lpId hilang.</p>
        </div>
      </div>
    )
  }

  // Pastikan lpId match dengan liveSlug — security: jangan biarin embed liar
  // pakai LP orang lain.
  const embed = await prisma.lpLiveEmbed.findUnique({
    where: { landingPageId: lpId },
    include: {
      liveRoom: { select: { slug: true, isActive: true } },
    },
  })
  if (!embed || !embed.isActive || embed.liveRoom.slug !== liveSlug) {
    notFound()
  }

  const room = await prisma.liveRoom.findUnique({
    where: { slug: liveSlug },
    select: {
      id: true,
      userId: true,
      name: true,
      description: true,
      greeting: true,
      ttsVoice: true,
      isActive: true,
      productIds: true,
      featuredProductId: true,
      botEnabled: true,
      botIntervalMinSec: true,
      botIntervalMaxSec: true,
      botPrompts: true,
      orderFormSlug: true,
      ttsPauseMs: true,
      hostTemplate: {
        select: {
          id: true,
          name: true,
          videoLoopUrl: true,
          mode: true,
          scenes: {
            where: { status: 'READY', videoUrl: { not: null }, isEnabled: true },
            orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
            select: { id: true, name: true, category: true, videoUrl: true, videoSeconds: true, isPrimary: true },
          },
        },
      },
    },
  })
  if (!room || !room.isActive) notFound()

  const hostMode = room.hostTemplate?.mode ?? 'TTS_GENERATIVE'
  let idleClipUrl: string | null = null
  let idleClips: Array<{ videoUrl: string; durationMs: number | null }> = []
  if (hostMode === 'NATIVE_LIBRARY' && room.hostTemplate?.id) {
    const { findIdleClips } = await import('@/lib/services/clip-library/match')
    const idleList = await findIdleClips(room.hostTemplate.id)
    idleClips = idleList.map((c) => ({ videoUrl: c.videoUrl, durationMs: c.durationMs }))
    idleClipUrl = idleClips[0]?.videoUrl ?? null
  }
  if (hostMode === 'TTS_GENERATIVE' && !room.hostTemplate?.videoLoopUrl) notFound()
  if (hostMode === 'NATIVE_LIBRARY' && !idleClipUrl) notFound()

  const products = await prisma.product.findMany({
    where: { id: { in: room.productIds }, isActive: true },
    select: {
      id: true, name: true, description: true, price: true, imageUrl: true, images: true,
      stock: true, weightGrams: true,
      flashSalePrice: true, flashSaleStartAt: true, flashSaleEndAt: true,
      flashSaleQuota: true, flashSaleSold: true, flashSaleActive: true,
      variants: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true, name: true, sku: true, price: true,
          weightGrams: true, stock: true, imageUrl: true,
        },
      },
    },
  })
  const order = new Map(room.productIds.map((id, i) => [id, i]))
  products.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999))

  const effectiveOrderFormSlug = await resolveLiveOrderFormSlug({
    explicitSlug: room.orderFormSlug ?? null,
    userId: room.userId,
    productIds: room.productIds,
  })

  return (
    <LiveEmbedView
      slug={liveSlug}
      name={room.name}
      greeting={room.greeting ?? null}
      hostName={room.hostTemplate.name}
      videoLoopUrl={
        hostMode === 'NATIVE_LIBRARY'
          ? (idleClipUrl as string)
          : (room.hostTemplate.videoLoopUrl as string)
      }
      hostMode={hostMode as 'TTS_GENERATIVE' | 'NATIVE_LIBRARY'}
      idleClipUrl={idleClipUrl}
      idleClips={idleClips}
      botConfig={{
        enabled: room.botEnabled,
        intervalMinSec: room.botIntervalMinSec,
        intervalMaxSec: room.botIntervalMaxSec,
        prompts: room.botPrompts,
      }}
      orderFormSlug={effectiveOrderFormSlug}
      ttsPauseMs={room.ttsPauseMs}
      scenes={room.hostTemplate.scenes.map((s) => ({
        id: s.id, name: s.name, category: s.category, videoUrl: s.videoUrl as string, isPrimary: s.isPrimary,
      }))}
      products={products.map((p) => {
        const now = Date.now()
        const startOk = !p.flashSaleStartAt || p.flashSaleStartAt.getTime() <= now
        const endOk = !p.flashSaleEndAt || p.flashSaleEndAt.getTime() > now
        const quotaOk = p.flashSaleQuota == null || p.flashSaleSold < p.flashSaleQuota
        const flashOn =
          p.flashSaleActive && p.flashSalePrice != null && p.flashSalePrice < p.price && startOk && endOk && quotaOk
        const gallery = p.images.length > 0 ? p.images : p.imageUrl ? [p.imageUrl] : []
        return {
          id: p.id, name: p.name, description: p.description, price: p.price,
          imageUrl: gallery[0] ?? null,
          images: gallery,
          stock: p.stock,
          weightGrams: p.weightGrams,
          variants: p.variants,
          flashSalePrice: flashOn ? p.flashSalePrice : null,
          flashSaleEndAt: flashOn ? p.flashSaleEndAt?.toISOString() ?? null : null,
          flashSaleQuota: flashOn ? p.flashSaleQuota : null,
          flashSaleSold: flashOn ? p.flashSaleSold : null,
        }
      })}
      featuredProductId={room.featuredProductId ?? null}
      gateConfig={{
        mode: embed.gateMode,
        fields: embed.gateFields as Array<'name' | 'phone' | 'email' | 'city' | 'productInterest'>,
        triggerSec: embed.gateTriggerSec,
        triggerOnChat: embed.gateTriggerOnChat,
        autoplay: embed.autoplay,
        mutedDefault: embed.mutedDefault,
      }}
      lpId={lpId}
    />
  )
}
