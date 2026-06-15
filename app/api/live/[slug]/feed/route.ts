// GET /api/live/[slug]/feed?since=<unixMs>&excludeSession=<id>
// Public — fetch chat events terbaru dari SEMUA session di room (untuk
// multi-user shared chat). Return events sejak `since` (default 60dtk lalu).
// excludeSession: skip event dari clientSessionId tertentu (biasanya
// caller's own session — supaya gak duplikat dengan msg lokal).
import { jsonError, jsonOkCached } from '@/lib/api'
import { getClientIp } from '@/lib/client-ip'
import { getFeedWindow } from '@/lib/services/live/feed-cache'
import {
  checkPollRateLimit,
  maybeCleanup,
} from '@/lib/services/live/rate-limit'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  // Anti-hammering — endpoint publik tanpa auth, tiap request = query DB.
  // Limit longgar utk CGNAT (lihat rate-limit.ts lapis 4).
  const rl = checkPollRateLimit(getClientIp(req), slug, 'feed')
  if (!rl.ok) {
    return jsonError(
      `Terlalu sering. Coba lagi dalam ${rl.retryAfterSec ?? 60}dtk.`,
      429,
    )
  }
  maybeCleanup()

  // Window event di-cache per room (feed-cache.ts). CDN-cacheable: kirim
  // seluruh window apa adanya; filter since & pesan-sendiri dilakukan di klien.
  const snap = await getFeedWindow(slug)
  if (!snap) return jsonError('Room tidak ditemukan', 404)
  if (!snap.isActive) return jsonError('Room offline', 410)

  const events = snap.events.slice(-50)

  return jsonOkCached({
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
  }, { sMaxage: 2, swr: 4 })
}
