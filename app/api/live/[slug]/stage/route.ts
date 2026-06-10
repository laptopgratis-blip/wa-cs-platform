// GET /api/live/[slug]/stage?seq=<lastSeq>
// Public — state "panggung bersama": jawaban host yang SEDANG tayang untuk
// SEMUA penonton. Client poll endpoint ini (~1.5dtk); kalau performanceSeq
// naik dari `seq` yang dipegang client → ada jawaban baru untuk diputar.
//
// Response: { seq, serverNow, performance | null }
//   performance = { seq, askerName, questionText, replyText, mode, clipUrl?,
//                   ttsUrls?, startedAt, endsAt } (lihat lib/services/live/stage)
import { jsonError, jsonOk } from '@/lib/api'
import { getClientIp } from '@/lib/client-ip'
import { prisma } from '@/lib/prisma'
import {
  checkPollRateLimit,
  maybeCleanup,
} from '@/lib/services/live/rate-limit'
import type { Performance } from '@/lib/services/live/stage'
import {
  getStageSnapshot,
  setStageSnapshot,
} from '@/lib/services/live/stage-cache'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const url = new URL(req.url)
  const sinceSeq = Number(url.searchParams.get('seq') ?? '0') || 0

  // Anti-hammering: poll legit ~40/menit per device; limit longgar utk CGNAT
  // (lihat rate-limit.ts lapis 4). Client yang kena 429 cukup lanjut poll
  // berikutnya seperti biasa.
  const rl = checkPollRateLimit(getClientIp(req), slug, 'stage')
  if (!rl.ok) {
    return jsonError(
      `Terlalu sering. Coba lagi dalam ${rl.retryAfterSec ?? 60}dtk.`,
      429,
    )
  }
  maybeCleanup()

  // Snapshot room di-cache ~1.2dtk (lihat stage-cache.ts) — endpoint ini
  // di-poll tiap 1.5dtk per device, tanpa cache DB kena ratusan query/dtk.
  let snap = getStageSnapshot(slug)
  if (snap === undefined) {
    const room = await prisma.liveRoom.findUnique({
      where: { slug },
      select: { id: true, isActive: true, currentPerformance: true, performanceSeq: true },
    })
    if (!room) {
      snap = null
    } else {
      // Indikator antrian: berapa pertanyaan menunggu/diproses (untuk badge
      // "N menunggu dijawab" di client). Room offline tak perlu COUNT.
      const pendingCount = room.isActive
        ? await prisma.liveQueueItem.count({
            where: { liveRoomId: room.id, status: { in: ['PENDING', 'ANSWERING'] } },
          })
        : 0
      snap = {
        roomId: room.id,
        isActive: room.isActive,
        performanceSeq: room.performanceSeq,
        performance: (room.currentPerformance as Performance | null) ?? null,
        pendingCount,
      }
    }
    setStageSnapshot(slug, snap)
  }

  if (!snap) return jsonError('Room tidak ditemukan', 404)
  if (!snap.isActive) return jsonError('Room offline', 410)

  // hasNew & serverNow dihitung per request — seq beda tiap client, dan
  // serverNow dipakai client untuk koreksi skew jam (harus selalu segar).
  const perf = snap.performance
  const hasNew = perf !== null && perf.seq > sinceSeq

  return jsonOk({
    seq: snap.performanceSeq,
    serverNow: Date.now(),
    performance: hasNew ? perf : null,
    pendingCount: snap.pendingCount,
  })
}
