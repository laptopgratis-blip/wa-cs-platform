// /live/[slug] — public live room. No auth. Server fetch room data dulu
// supaya kalau 404/410 user dapat halaman friendly.
import type { Viewport } from 'next'
import { notFound } from 'next/navigation'

import { LiveRoomView } from '@/components/live/LiveRoomView'
import { prisma } from '@/lib/prisma'
import { resolveLiveOrderFormSlug } from '@/lib/services/live/order-form'

export const dynamic = 'force-dynamic'

// Live = pengalaman full-screen. Kunci skala supaya pinch/double-tap tidak
// menggeser/membesarkan tampilan di mobile. (Override viewport root layout
// hanya untuk route ini.)
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

// Layout root — di luar (dashboard) supaya tidak ke-wrap sidebar Hulao.
// Public live room = full-screen experience.
export default async function PublicLivePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const room = await prisma.liveRoom.findUnique({
    where: { slug },
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
          sourceImageUrl: true,
          mode: true,
          scenes: {
            where: { status: 'READY', videoUrl: { not: null }, isEnabled: true },
            orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
            select: {
              id: true,
              name: true,
              category: true,
              videoUrl: true,
              videoSeconds: true,
              isPrimary: true,
            },
          },
        },
      },
    },
  })

  if (!room) notFound()
  if (!room.isActive) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-zinc-900 to-black p-6 text-center text-white">
        <div className="text-4xl">📴</div>
        <h1 className="mt-4 text-2xl font-semibold">Live sedang offline</h1>
        <p className="mt-2 max-w-md text-sm text-zinc-300">
          Sesi live <strong>{room.name}</strong> belum dimulai atau sudah selesai.
          Cek lagi nanti, ya.
        </p>
      </div>
    )
  }
  // Untuk Klip Live mode: butuh minimal 1 klip aktif (idle/general) untuk loop.
  // Untuk TTS mode: butuh videoLoopUrl. Cek per mode.
  const hostMode = room.hostTemplate?.mode ?? 'TTS_GENERATIVE'
  let idleClipUrl: string | null = null
  let idleClips: Array<{ videoUrl: string; durationMs: number | null }> = []
  if (hostMode === 'NATIVE_LIBRARY' && room.hostTemplate?.id) {
    // Ambil semua idle clip → array buat rotation di client (LRU spread).
    const { findIdleClips } = await import('@/lib/services/clip-library/match')
    const idleList = await findIdleClips(room.hostTemplate.id)
    idleClips = idleList.map((c) => ({ videoUrl: c.videoUrl, durationMs: c.durationMs }))
    idleClipUrl = idleClips[0]?.videoUrl ?? null
  }
  // Pre-req per mode
  if (hostMode === 'TTS_GENERATIVE' && !room.hostTemplate?.videoLoopUrl) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-zinc-900 to-black p-6 text-center text-white">
        <div className="text-4xl">⚙️</div>
        <h1 className="mt-4 text-2xl font-semibold">Host belum siap</h1>
        <p className="mt-2 max-w-md text-sm text-zinc-300">
          Avatar host masih dalam proses generate. Coba lagi beberapa menit.
        </p>
      </div>
    )
  }
  if (hostMode === 'NATIVE_LIBRARY' && !idleClipUrl) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-zinc-900 to-black p-6 text-center text-white">
        <div className="text-4xl">🎙️</div>
        <h1 className="mt-4 text-2xl font-semibold">Klip Live belum siap</h1>
        <p className="mt-2 max-w-md text-sm text-zinc-300">
          Owner belum bikin klip idle loop. Owner perlu generate minimal 1 klip
          (kategori IDLE atau tandai isDefaultIdle) sebelum live mulai.
        </p>
      </div>
    )
  }

  const products = await prisma.product.findMany({
    where: { id: { in: room.productIds }, isActive: true },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      imageUrl: true,
      images: true,
      stock: true,
      weightGrams: true,
      flashSalePrice: true,
      flashSaleStartAt: true,
      flashSaleEndAt: true,
      flashSaleQuota: true,
      flashSaleSold: true,
      flashSaleActive: true,
      variants: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          name: true,
          sku: true,
          price: true,
          weightGrams: true,
          stock: true,
          imageUrl: true,
        },
      },
    },
  })
  const order = new Map(room.productIds.map((id, i) => [id, i]))
  products.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999))

  // Tombol "Order" selalu ke form — fallback ke form default owner kalau room
  // belum set orderFormSlug.
  const effectiveOrderFormSlug = await resolveLiveOrderFormSlug({
    explicitSlug: room.orderFormSlug ?? null,
    userId: room.userId,
    productIds: room.productIds,
  })

  return (
    <LiveRoomView
      slug={slug}
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
        id: s.id,
        name: s.name,
        category: s.category,
        videoUrl: s.videoUrl as string,
        isPrimary: s.isPrimary,
      }))}
      products={products.map((p) => {
        // Flash sale aktif kalau: flag on, harga di-set, sekarang dalam window,
        // dan quota belum habis (kalau quota di-set). Validasi dilakukan
        // server-side supaya client cukup tampilkan harga + countdown.
        const now = Date.now()
        const startOk = !p.flashSaleStartAt || p.flashSaleStartAt.getTime() <= now
        const endOk = !p.flashSaleEndAt || p.flashSaleEndAt.getTime() > now
        const quotaOk =
          p.flashSaleQuota == null || p.flashSaleSold < p.flashSaleQuota
        const flashOn =
          p.flashSaleActive &&
          p.flashSalePrice != null &&
          p.flashSalePrice < p.price &&
          startOk &&
          endOk &&
          quotaOk
        const gallery =
          p.images.length > 0 ? p.images : p.imageUrl ? [p.imageUrl] : []
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          price: p.price,
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
    />
  )
}
