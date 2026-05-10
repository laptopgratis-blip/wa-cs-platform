// Library — query ContentPiece + ContentIdea untuk dashboard user.
import { prisma } from '@/lib/prisma'

export interface LibraryFilter {
  channel?: string
  funnelStage?: string
  status?: string
  briefId?: string
  // Phase 6 — filter ORGANIC | ADS (default: tidak di-filter, tampil semua).
  pieceType?: string
}

export async function listPiecesForOwner(
  userId: string,
  filter: LibraryFilter = {},
) {
  return prisma.contentPiece.findMany({
    where: {
      userId,
      ...(filter.channel && { channel: filter.channel }),
      ...(filter.funnelStage && { funnelStage: filter.funnelStage }),
      ...(filter.status && { status: filter.status }),
      ...(filter.briefId && { briefId: filter.briefId }),
      ...(filter.pieceType && { pieceType: filter.pieceType }),
    },
    include: {
      brief: { select: { id: true, lpId: true, manualTitle: true } },
      _count: { select: { slides: true, variants: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
}

export async function getPieceForOwner(userId: string, pieceId: string) {
  return prisma.contentPiece.findFirst({
    where: { id: pieceId, userId },
    include: {
      slides: { orderBy: { slideIndex: 'asc' } },
      // Phase 6 — load variants untuk ads piece. Sorted by type then order.
      variants: { orderBy: [{ variantType: 'asc' }, { order: 'asc' }] },
      brief: {
        select: {
          id: true,
          lpId: true,
          manualTitle: true,
          tone: true,
          lp: { select: { id: true, title: true, slug: true } },
        },
      },
      sourceIdea: {
        select: {
          id: true,
          method: true,
          hook: true,
          angle: true,
          whyItWorks: true,
        },
      },
    },
  })
}

export async function listIdeasForOwner(
  userId: string,
  filter: { lpId?: string; method?: string; promoted?: boolean } = {},
) {
  return prisma.contentIdea.findMany({
    where: {
      userId,
      ...(filter.lpId && { lpId: filter.lpId }),
      ...(filter.method && { method: filter.method }),
      ...(filter.promoted !== undefined && {
        promotedToPieceId: filter.promoted ? { not: null } : null,
      }),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
}

export async function updatePieceStatus(
  userId: string,
  pieceId: string,
  status: 'DRAFT' | 'READY' | 'POSTED' | 'ARCHIVED',
) {
  const result = await prisma.contentPiece.updateMany({
    where: { id: pieceId, userId },
    data: {
      status,
      ...(status === 'POSTED' && { postedAt: new Date() }),
    },
  })
  if (result.count === 0) throw new Error('Piece tidak ditemukan')
  return prisma.contentPiece.findUnique({ where: { id: pieceId } })
}
