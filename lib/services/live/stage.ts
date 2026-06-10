// ─────────────────────────────────────────
// PANGGUNG BERSAMA (shared live stage) — 2026-06-10
// ─────────────────────────────────────────
// Mengubah Live Room dari "tiap device jawab sendiri" → satu host global yang
// menjawab antrian (FIFO, prioritas user asli > bot) dan ditonton SEMUA device.
//
// Alur:
//   1. /chat → enqueueQuestion() masuk LiveQueueItem (PENDING) + trigger advance.
//   2. advanceStage(roomId): kalau host idle → tarik 1 item → generate jawaban
//      (clip match utk NATIVE, atau Claude+TTS utk TTS mode) → set
//      LiveRoom.currentPerformance + performanceSeq++ + endsAt.
//   3. Cron tick memanggil advanceStage tiap ~2dtk utk lanjut antrian saat
//      jawaban selesai.
//   4. Client poll /stage → putar performance yg sama di semua device.
//
// Lock: optimistic via LiveRoom.stageLockedUntil (atomic updateMany) — cegah
// dua proses generate barengan.
import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { InsufficientBalanceError } from '@/lib/services/ai-generation-log'

import { generateLiveReply, type ChatTurn, type LiveProduct } from './chat'
import { bumpMessageCount, logLiveEvent } from './tangkap'
import { generateLiveTtsBatch } from './tts'

export interface Performance {
  seq: number
  askerName: string | null
  questionText: string
  replyText: string
  mode: 'clip' | 'tts' | 'text'
  clipUrl?: string | null
  ttsUrls?: string[]
  startedAt: number // unix ms
  endsAt: number // unix ms — host idle lagi setelah ini
}

const STAGE_LOCK_MS = 30_000 // proteksi maksimal saat generate
const TAIL_BUFFER_MS = 900 // jeda kecil setelah jawaban sebelum lanjut antrian
const QUEUE_CAP = 8 // antrian maks; kelebihan bot dibuang (real user diutamakan)
const HISTORY_EVENTS = 8 // konteks room utk host (multi-turn ringan)

// Estimasi durasi TTS dari teks (OpenAI TTS tak kasih durasi). ~14 char/dtk
// Bahasa Indonesia, disesuaikan kecepatan + jeda antar kalimat.
function estimateTtsDurationMs(
  sentences: string[],
  speed: number,
  pauseMs: number,
): number {
  const chars = sentences.reduce((n, s) => n + s.length, 0)
  const charsPerSec = 14 * Math.max(0.5, speed || 1)
  const speakMs = (chars / charsPerSec) * 1000
  const pauses = Math.max(0, sentences.length - 1) * Math.max(0, pauseMs)
  return Math.max(3000, Math.round(speakMs + pauses + TAIL_BUFFER_MS))
}

// ── ENQUEUE ──────────────────────────────────────────────────────────────
// Masukkan pertanyaan ke antrian. Kalau antrian sudah penuh, buang item BOT
// terlama dulu (real user tak pernah dibuang). Return true kalau ter-enqueue.
export async function enqueueQuestion(input: {
  liveRoomId: string
  liveSessionId?: string | null
  askerName?: string | null
  isBot: boolean
  questionText: string
}): Promise<boolean> {
  const pendingCount = await prisma.liveQueueItem.count({
    where: { liveRoomId: input.liveRoomId, status: 'PENDING' },
  })
  if (pendingCount >= QUEUE_CAP) {
    if (input.isBot) {
      // Antrian penuh + ini bot → drop (jangan bikin host makin telat).
      return false
    }
    // Real user masuk tapi penuh → buang 1 bot PENDING terlama biar muat.
    const oldestBot = await prisma.liveQueueItem.findFirst({
      where: { liveRoomId: input.liveRoomId, status: 'PENDING', isBot: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    if (oldestBot) {
      await prisma.liveQueueItem.update({
        where: { id: oldestBot.id },
        data: { status: 'DROPPED' },
      })
    }
  }
  await prisma.liveQueueItem.create({
    data: {
      liveRoomId: input.liveRoomId,
      liveSessionId: input.liveSessionId ?? null,
      askerName: input.askerName ?? null,
      isBot: input.isBot,
      questionText: input.questionText.slice(0, 500),
    },
  })
  return true
}

// Pilih item berikutnya: real user FIFO dulu, baru bot FIFO.
async function pickNext(liveRoomId: string) {
  const real = await prisma.liveQueueItem.findFirst({
    where: { liveRoomId, status: 'PENDING', isBot: false },
    orderBy: { createdAt: 'asc' },
  })
  if (real) return real
  return prisma.liveQueueItem.findFirst({
    where: { liveRoomId, status: 'PENDING', isBot: true },
    orderBy: { createdAt: 'asc' },
  })
}

type RoomConfig = Prisma.LiveRoomGetPayload<{
  include: { hostTemplate: { select: { id: true; mode: true } } }
}>

// Bangun history singkat dari event room terbaru (konteks multi-turn ringan).
async function buildRoomHistory(liveRoomId: string): Promise<ChatTurn[]> {
  const events = await prisma.liveEvent.findMany({
    where: {
      liveSession: { liveRoomId },
      type: { in: ['USER_MESSAGE', 'AI_MESSAGE'] },
    },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_EVENTS,
    select: { type: true, payload: true },
  })
  return events
    .reverse()
    .map((e) => {
      const p = (e.payload as { text?: string } | null) ?? null
      const text = p?.text?.trim()
      if (!text) return null
      return {
        role: e.type === 'USER_MESSAGE' ? 'user' : 'assistant',
        content: text.slice(0, 1000),
      } as ChatTurn
    })
    .filter((t): t is ChatTurn => t !== null)
}

// Ambil produk room (untuk konteks Claude) + resolve flash sale aktif.
async function fetchLiveProducts(productIds: string[]): Promise<LiveProduct[]> {
  if (productIds.length === 0) return []
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, isActive: true },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      imageUrl: true,
      flashSalePrice: true,
      flashSaleStartAt: true,
      flashSaleEndAt: true,
      flashSaleQuota: true,
      flashSaleSold: true,
      flashSaleActive: true,
    },
  })
  const order = new Map(productIds.map((id, i) => [id, i]))
  products.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999))
  const nowMs = Date.now()
  return products.map((p) => {
    const startOk = !p.flashSaleStartAt || p.flashSaleStartAt.getTime() <= nowMs
    const endOk = !p.flashSaleEndAt || p.flashSaleEndAt.getTime() > nowMs
    const quotaOk = p.flashSaleQuota == null || p.flashSaleSold < p.flashSaleQuota
    const flashOn =
      p.flashSaleActive &&
      p.flashSalePrice != null &&
      p.flashSalePrice < p.price &&
      startOk &&
      endOk &&
      quotaOk
    return {
      id: p.id,
      name: p.name,
      price: p.price,
      description: p.description,
      imageUrl: p.imageUrl,
      flashSalePrice: flashOn ? p.flashSalePrice : null,
      flashSaleEndAt: flashOn ? p.flashSaleEndAt?.toISOString() ?? null : null,
    }
  })
}

// Generate 1 jawaban untuk 1 item antrian → Performance (belum di-set ke DB).
async function buildPerformance(
  room: RoomConfig,
  item: { id: string; questionText: string; askerName: string | null; liveSessionId: string | null },
  nextSeq: number,
): Promise<Performance> {
  const now = Date.now()
  const base = {
    seq: nextSeq,
    askerName: item.askerName,
    questionText: item.questionText,
    startedAt: now,
  }

  // ── NATIVE_LIBRARY: cocokkan klip (audio bonded) ──
  if (room.hostTemplate?.mode === 'NATIVE_LIBRARY') {
    const { matchClip } = await import('@/lib/services/clip-library/match')
    const matched = await matchClip({
      hostTemplateId: room.hostTemplate.id,
      question: item.questionText,
      liveSessionId: item.liveSessionId,
      ownerUserId: room.userId,
    })
    if (matched) {
      const durationMs = matched.durationMs ?? 8000
      return {
        ...base,
        replyText: matched.transcript,
        mode: 'clip',
        clipUrl: matched.videoUrl,
        endsAt: now + durationMs + TAIL_BUFFER_MS,
      }
    }
    // Tak ada match → tampil teks singkat sebentar.
    return {
      ...base,
      replyText: 'Bentar ya kak, host lagi siap-siap...',
      mode: 'text',
      endsAt: now + 3500,
    }
  }

  // ── TTS_GENERATIVE: Claude reply + TTS per kalimat ──
  const history = await buildRoomHistory(room.id)
  const products = await fetchLiveProducts(room.productIds)
  const reply = await generateLiveReply({
    ownerUserId: room.userId,
    roomId: room.id,
    systemPromptBase: room.systemPrompt,
    products,
    message: item.questionText,
    history,
    model: room.chatModel,
    temperature: room.chatTemperature,
    customerName: item.askerName,
  })

  let ttsUrls: string[] = []
  try {
    const audios = await generateLiveTtsBatch({
      sentences: reply.sentences,
      voice: room.ttsVoice,
      instructions: room.ttsInstructions ?? undefined,
      speed: room.ttsSpeed,
      pitchOffset: room.ttsPitchOffset,
      expressiveness: room.ttsExpressiveness,
      userId: room.userId,
      subjectType: 'LIVE_TTS',
      subjectId: item.liveSessionId ?? room.id,
    })
    ttsUrls = audios
      .map((a) => a?.url)
      .filter((u): u is string => Boolean(u))
  } catch {
    // TTS gagal → text-only (durasi dari estimasi teks).
    ttsUrls = []
  }

  const durationMs = estimateTtsDurationMs(
    reply.sentences.length ? reply.sentences : [reply.reply],
    room.ttsSpeed,
    room.ttsPauseMs,
  )
  return {
    ...base,
    replyText: reply.reply,
    mode: ttsUrls.length > 0 ? 'tts' : 'text',
    ttsUrls,
    endsAt: now + durationMs,
  }
}

// ── ADVANCE ──────────────────────────────────────────────────────────────
// Inti loop host. Idempotent & aman dipanggil concurrent (lock optimistic).
// Return { advanced, reason } untuk observability.
export async function advanceStage(
  liveRoomId: string,
): Promise<{ advanced: boolean; reason: string }> {
  const now = Date.now()

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    include: { hostTemplate: { select: { id: true, mode: true } } },
  })
  if (!room) return { advanced: false, reason: 'room-not-found' }
  if (!room.isActive) return { advanced: false, reason: 'room-offline' }

  const perf = (room.currentPerformance as Performance | null) ?? null
  if (perf && perf.endsAt > now) {
    return { advanced: false, reason: 'still-performing' }
  }
  if (room.stageLockedUntil && room.stageLockedUntil.getTime() > now) {
    return { advanced: false, reason: 'locked' }
  }

  // Ambil lock atomik: hanya 1 proses yg lolos.
  const lock = await prisma.liveRoom.updateMany({
    where: {
      id: liveRoomId,
      OR: [
        { stageLockedUntil: null },
        { stageLockedUntil: { lt: new Date(now) } },
      ],
    },
    data: { stageLockedUntil: new Date(now + STAGE_LOCK_MS) },
  })
  if (lock.count === 0) return { advanced: false, reason: 'lock-lost' }

  try {
    const item = await pickNext(liveRoomId)
    if (!item) {
      // Antrian kosong → bersihkan performance lama (host idle) + lepas lock.
      await prisma.liveRoom.update({
        where: { id: liveRoomId },
        data: { currentPerformance: Prisma.JsonNull, stageLockedUntil: null },
      })
      return { advanced: false, reason: 'queue-empty' }
    }

    await prisma.liveQueueItem.update({
      where: { id: item.id },
      data: { status: 'ANSWERING' },
    })

    const nextSeq = room.performanceSeq + 1
    let performance: Performance
    try {
      performance = await buildPerformance(
        room,
        {
          id: item.id,
          questionText: item.questionText,
          askerName: item.askerName,
          liveSessionId: item.liveSessionId,
        },
        nextSeq,
      )
    } catch (err) {
      // Generate gagal (mis. saldo 0) → tandai item DONE biar tidak nyangkut,
      // lepas lock, jangan set performance.
      await prisma.liveQueueItem.update({
        where: { id: item.id },
        data: { status: 'DONE', answeredAt: new Date() },
      })
      await prisma.liveRoom.update({
        where: { id: liveRoomId },
        data: { stageLockedUntil: null },
      })
      const reason =
        err instanceof InsufficientBalanceError ? 'insufficient-balance' : 'generate-failed'
      return { advanced: false, reason }
    }

    await prisma.liveRoom.update({
      where: { id: liveRoomId },
      data: {
        currentPerformance: performance as unknown as Prisma.InputJsonValue,
        performanceSeq: nextSeq,
        stageLockedUntil: null,
      },
    })
    await prisma.liveQueueItem.update({
      where: { id: item.id },
      data: { status: 'DONE', answeredAt: new Date() },
    })

    // Log AI_MESSAGE utk analitik + history room (best-effort).
    if (item.liveSessionId) {
      try {
        await logLiveEvent({
          liveSessionId: item.liveSessionId,
          type: 'AI_MESSAGE',
          payload: { text: performance.replyText, mode: performance.mode },
        })
        await bumpMessageCount(item.liveSessionId)
      } catch {
        /* best-effort */
      }
    }

    return { advanced: true, reason: 'performed' }
  } catch (err) {
    // Safety: apa pun yg meledak, lepas lock supaya tidak deadlock.
    await prisma.liveRoom
      .update({ where: { id: liveRoomId }, data: { stageLockedUntil: null } })
      .catch(() => {})
    return { advanced: false, reason: `error:${(err as Error).message.slice(0, 80)}` }
  }
}

// ── TICK ──────────────────────────────────────────────────────────────────
// Dipanggil cron (~2dtk): lanjutkan antrian semua room aktif yg punya item
// PENDING. advanceStage no-op kalau room masih menjawab (cheap), generate
// kalau idle. Inilah yg "menarik" antrian saat jawaban sebelumnya selesai.
export async function runStageTick(): Promise<{
  checked: number
  advanced: number
}> {
  const rooms = await prisma.liveRoom.findMany({
    where: { isActive: true, queueItems: { some: { status: 'PENDING' } } },
    select: { id: true },
    take: 100,
  })
  let advanced = 0
  for (const r of rooms) {
    const res = await advanceStage(r.id)
    if (res.advanced) advanced++
  }
  return { checked: rooms.length, advanced }
}
