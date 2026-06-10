// GET /api/live/[slug]/stage?seq=<lastSeq>
// Public — state "panggung bersama": jawaban host yang SEDANG tayang untuk
// SEMUA penonton. Client poll endpoint ini (~1.5dtk); kalau performanceSeq
// naik dari `seq` yang dipegang client → ada jawaban baru untuk diputar.
//
// Response: { seq, serverNow, performance | null }
//   performance = { seq, askerName, questionText, replyText, mode, clipUrl?,
//                   ttsUrls?, startedAt, endsAt } (lihat lib/services/live/stage)
import { jsonError, jsonOk } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import type { Performance } from '@/lib/services/live/stage'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const url = new URL(req.url)
  const sinceSeq = Number(url.searchParams.get('seq') ?? '0') || 0

  const room = await prisma.liveRoom.findUnique({
    where: { slug },
    select: { id: true, isActive: true, currentPerformance: true, performanceSeq: true },
  })
  if (!room) return jsonError('Room tidak ditemukan', 404)
  if (!room.isActive) return jsonError('Room offline', 410)

  const perf = (room.currentPerformance as Performance | null) ?? null
  const hasNew = perf !== null && perf.seq > sinceSeq

  // Indikator antrian: berapa pertanyaan menunggu/diproses (untuk badge
  // "N menunggu dijawab" di client).
  const pendingCount = await prisma.liveQueueItem.count({
    where: { liveRoomId: room.id, status: { in: ['PENDING', 'ANSWERING'] } },
  })

  return jsonOk({
    seq: room.performanceSeq,
    serverNow: Date.now(),
    performance: hasNew ? perf : null,
    pendingCount,
  })
}
