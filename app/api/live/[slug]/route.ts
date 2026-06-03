// GET /api/live/[slug] — data publik room (host video URL, products, greeting).
// Tidak butuh auth. isActive=false → return 410 Gone.
import { jsonError, jsonOk } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const room = await prisma.liveRoom.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      description: true,
      greeting: true,
      ttsVoice: true,
      isActive: true,
      productIds: true,
      hostTemplate: {
        select: {
          id: true,
          name: true,
          videoLoopUrl: true,
          sourceImageUrl: true,
          status: true,
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
  if (!room) return jsonError('Live room tidak ditemukan', 404)
  if (!room.isActive) {
    return jsonError('Live sedang offline', 410)
  }
  if (!room.hostTemplate?.videoLoopUrl) {
    return jsonError(
      'Host belum siap (video belum di-generate). Hubungi pemilik.',
      503,
    )
  }

  // Ambil products sesuai urutan productIds.
  const products = await prisma.product.findMany({
    where: { id: { in: room.productIds }, isActive: true },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      imageUrl: true,
      images: true,
    },
  })
  // Re-order by productIds order
  const order = new Map(room.productIds.map((id, i) => [id, i]))
  products.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999))

  return jsonOk({
    id: room.id,
    name: room.name,
    description: room.description,
    greeting: room.greeting,
    ttsVoice: room.ttsVoice,
    host: {
      id: room.hostTemplate.id,
      name: room.hostTemplate.name,
      videoLoopUrl: room.hostTemplate.videoLoopUrl,
      sourceImageUrl: room.hostTemplate.sourceImageUrl,
      scenes: room.hostTemplate.scenes,
    },
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      imageUrl: p.imageUrl ?? p.images[0] ?? null,
    })),
  })
}
