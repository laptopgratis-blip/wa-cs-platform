// GET /api/live/[slug]/feed?since=<unixMs>&excludeSession=<id>
// Public — fetch chat events terbaru dari SEMUA session di room (untuk
// multi-user shared chat). Return events sejak `since` (default 60dtk lalu).
// excludeSession: skip event dari clientSessionId tertentu (biasanya
// caller's own session — supaya gak duplikat dengan msg lokal).
import { jsonError, jsonOk } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const MAX_LIMIT = 50
const DEFAULT_LOOKBACK_MS = 60_000

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const url = new URL(req.url)
  const sinceParam = url.searchParams.get('since')
  const since = sinceParam ? new Date(Number(sinceParam)) : new Date(Date.now() - DEFAULT_LOOKBACK_MS)
  const excludeSession = url.searchParams.get('excludeSession')?.trim() || null
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get('limit') ?? 30)),
  )

  const room = await prisma.liveRoom.findUnique({
    where: { slug },
    select: { id: true, isActive: true },
  })
  if (!room) return jsonError('Room tidak ditemukan', 404)
  if (!room.isActive) return jsonError('Room offline', 410)

  // Ambil events USER_MESSAGE + AI_MESSAGE dari semua session room.
  // excludeSession di-filter via JOIN ke LiveSession.clientSessionId.
  const events = await prisma.liveEvent.findMany({
    where: {
      liveSession: {
        liveRoomId: room.id,
        ...(excludeSession ? { clientSessionId: { not: excludeSession } } : {}),
      },
      type: { in: ['USER_MESSAGE', 'AI_MESSAGE'] },
      createdAt: { gt: since },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: {
      id: true,
      type: true,
      payload: true,
      createdAt: true,
      liveSession: {
        select: {
          clientSessionId: true,
          customerName: true,
        },
      },
    },
  })

  return jsonOk({
    events: events.map((e) => {
      const payload =
        (e.payload as {
          text?: string
          tokensCharged?: number
          customerName?: string
          isBot?: boolean
        } | null) ?? null
      // Bot messages share session (bot-cron-<roomId>) yang gak punya customerName.
      // Bot's per-message varied name disimpan di payload.customerName.
      // Prefer payload-level kalau ada, fallback ke session-level (real customer).
      const displayName = payload?.customerName ?? e.liveSession.customerName
      return {
        id: e.id,
        type: e.type,
        text: payload?.text ?? '',
        customerName: displayName,
        isBot: payload?.isBot ?? false,
        clientSessionId: e.liveSession.clientSessionId,
        createdAt: e.createdAt.getTime(),
      }
    }),
    now: Date.now(),
  })
}
