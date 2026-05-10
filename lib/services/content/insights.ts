// Insights — agregat performance konten user.
//
// Aggregate dari ContentPiece yang punya metricUpdatedAt (= sudah di-record
// metric-nya). Hitung rata-rata reach per dimension (channel, funnelStage,
// method via sourceIdea), dan top-3 winner pieces.
//
// Dipakai oleh /content tab Insights & idea-generator method WINNER.
import { prisma } from '@/lib/prisma'

export interface InsightDimensionRow {
  key: string // mis. 'IG_REELS', 'TOFU', 'HOOK'
  count: number
  avgReach: number
  totalReach: number
  bestPieceId?: string
  bestPieceTitle?: string
  bestPieceReach?: number
}

export interface WinnerPiece {
  id: string
  title: string
  channel: string
  funnelStage: string
  method?: string // dari sourceIdea kalau ada
  hook?: string
  angle?: string
  reach: number
  saves: number
  shares: number
  comments: number
  dms: number
  linkClicks: number
  postedAt: string | null
}

export interface InsightsResult {
  totalWithMetric: number
  totalReach: number
  byChannel: InsightDimensionRow[]
  byFunnel: InsightDimensionRow[]
  byMethod: InsightDimensionRow[]
  winners: WinnerPiece[]
}

export async function getInsightsForUser(userId: string): Promise<InsightsResult> {
  const pieces = await prisma.contentPiece.findMany({
    where: {
      userId,
      metricUpdatedAt: { not: null },
    },
    select: {
      id: true,
      title: true,
      channel: true,
      funnelStage: true,
      reach: true,
      saves: true,
      shares: true,
      comments: true,
      dms: true,
      linkClicks: true,
      postedAt: true,
      sourceIdea: {
        select: { method: true, hook: true, angle: true },
      },
    },
    orderBy: { reach: 'desc' },
    take: 200,
  })

  const totalWithMetric = pieces.length
  const totalReach = pieces.reduce((s, p) => s + (p.reach ?? 0), 0)

  const byChannel = aggregateBy(pieces, (p) => p.channel)
  const byFunnel = aggregateBy(pieces, (p) => p.funnelStage)
  const byMethod = aggregateBy(pieces, (p) => p.sourceIdea?.method ?? 'UNKNOWN')

  const winners: WinnerPiece[] = pieces
    .filter((p) => (p.reach ?? 0) > 0)
    .slice(0, 3)
    .map((p) => ({
      id: p.id,
      title: p.title,
      channel: p.channel,
      funnelStage: p.funnelStage,
      method: p.sourceIdea?.method,
      hook: p.sourceIdea?.hook,
      angle: p.sourceIdea?.angle,
      reach: p.reach ?? 0,
      saves: p.saves ?? 0,
      shares: p.shares ?? 0,
      comments: p.comments ?? 0,
      dms: p.dms ?? 0,
      linkClicks: p.linkClicks ?? 0,
      postedAt: p.postedAt?.toISOString() ?? null,
    }))

  return {
    totalWithMetric,
    totalReach,
    byChannel,
    byFunnel,
    byMethod,
    winners,
  }
}

interface PieceRow {
  id: string
  title: string
  reach: number | null
}

function aggregateBy<T extends PieceRow>(
  pieces: T[],
  keyFn: (p: T) => string,
): InsightDimensionRow[] {
  const groups = new Map<string, { count: number; totalReach: number; best: T | null }>()
  for (const p of pieces) {
    const key = keyFn(p)
    const reach = p.reach ?? 0
    const existing = groups.get(key) ?? { count: 0, totalReach: 0, best: null }
    existing.count += 1
    existing.totalReach += reach
    if (!existing.best || (existing.best.reach ?? 0) < reach) {
      existing.best = p
    }
    groups.set(key, existing)
  }
  return Array.from(groups.entries())
    .map(([key, v]) => ({
      key,
      count: v.count,
      avgReach: v.count > 0 ? Math.round(v.totalReach / v.count) : 0,
      totalReach: v.totalReach,
      bestPieceId: v.best?.id,
      bestPieceTitle: v.best?.title,
      bestPieceReach: v.best?.reach ?? undefined,
    }))
    .sort((a, b) => b.avgReach - a.avgReach)
}
