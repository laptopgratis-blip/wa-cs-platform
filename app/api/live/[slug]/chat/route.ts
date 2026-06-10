// POST /api/live/[slug]/chat — kirim pesan customer, dapat balasan AI +
// audio TTS per kalimat. Rate-limited per IP per slug.
//
// Body: { message: string, history?: [{role, content}] }
// Response: { reply, sentences: [{ text, audioUrl }], tokensCharged }
//
// Catatan: kalau owner saldo 0 → 402 (Payment Required). Kalau TTS gagal,
// return text saja tanpa audio (graceful degrade — customer tetap bisa baca).
import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api'
import { getClientIp } from '@/lib/client-ip'
import { prisma } from '@/lib/prisma'
import { InsufficientBalanceError } from '@/lib/services/ai-generation-log'
import { generateLiveReply, type ChatTurn, type LiveProduct } from '@/lib/services/live/chat'
import {
  checkRateLimit,
  checkRoomRateLimit,
  maybeCleanup,
} from '@/lib/services/live/rate-limit'
import {
  bumpMessageCount,
  ensureLiveSession,
  logLiveEvent,
  makeFingerprint,
} from '@/lib/services/live/tangkap'
import { generateLiveTtsBatch } from '@/lib/services/live/tts'

const chatSchema = z.object({
  message: z.string().trim().min(1).max(500),
  // UUID dari client (sessionStorage). Wajib supaya Tangkap layer punya
  // session id stabil antar request.
  clientSessionId: z.string().trim().min(8).max(64),
  // Identitas asker untuk turn ini — bisa nama customer asli ATAU nama bot
  // viewer pseudonim (kalau isBot=true). Host akan sapa pakai nama ini.
  customerName: z.string().trim().min(1).max(80).optional(),
  customerPhone: z.string().trim().min(8).max(20).optional(),
  // True kalau pesan dari bot demo viewer — backend skip Tangkap session
  // event supaya lead-capture metrics tidak ke-polusi pesan palsu.
  isBot: z.boolean().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(1500),
      }),
    )
    .max(40)
    .optional(),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const parsed = chatSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid', 400)
  }
  const { message, isBot } = parsed.data
  const history: ChatTurn[] = parsed.data.history ?? []

  // Rate limit per IP per slug. IP diambil dari elemen TERAKHIR XFF (yang
  // di-append Traefik) — elemen pertama bisa dipalsukan client.
  const ip = getClientIp(req)
  const rl = checkRateLimit(ip, slug)
  if (!rl.ok) {
    return jsonError(
      `Terlalu banyak pesan. Coba lagi dalam ${rl.retryAfterSec ?? 60}dtk.`,
      429,
    )
  }
  // Defense-in-depth: cap global per room, terlepas IP. Limit per-IP saja
  // tidak cukup kalau penyerang rotasi IP (botnet/proxy) — tiap pesan memicu
  // Claude + TTS berbayar dari saldo owner.
  const roomRl = checkRoomRateLimit(slug)
  if (!roomRl.ok) {
    return jsonError(
      `Room lagi ramai banget. Coba lagi dalam ${roomRl.retryAfterSec ?? 60}dtk.`,
      429,
    )
  }
  maybeCleanup()

  const room = await prisma.liveRoom.findUnique({
    where: { slug },
    select: {
      id: true,
      userId: true,
      systemPrompt: true,
      productIds: true,
      isActive: true,
      ttsVoice: true,
      ttsInstructions: true,
      ttsSpeed: true,
      ttsPitchOffset: true,
      ttsExpressiveness: true,
      chatModel: true,
      chatTemperature: true,
      // Sprint 4: deteksi mode HostTemplate untuk branching pipeline.
      hostTemplate: {
        select: { id: true, mode: true },
      },
    },
  })
  if (!room) return jsonError('Live room tidak ditemukan', 404)
  if (!room.isActive) return jsonError('Live sedang offline', 410)

  // Tangkap: ensure session + log USER_MESSAGE event.
  // Kalau isBot=true, JANGAN bind nama/phone bot ke session (session = milik
  // customer asli) dan skip log + counter — bot messages tidak boleh polusi
  // Tangkap lead metrics.
  const fp = makeFingerprint({ ip, ua: req.headers.get('user-agent') })
  let session: { id: string; isNew: boolean; customerName: string | null }
  try {
    session = await ensureLiveSession({
      clientSessionId: parsed.data.clientSessionId,
      liveRoomId: room.id,
      userId: room.userId,
      fingerprint: fp,
      customerName: isBot ? undefined : parsed.data.customerName,
      customerPhone: isBot ? undefined : parsed.data.customerPhone,
    })
  } catch (err) {
    return jsonError((err as Error).message, 400)
  }
  if (!isBot) {
    await logLiveEvent({
      liveSessionId: session.id,
      type: 'USER_MESSAGE',
      payload: { text: message, customerName: session.customerName },
    })
    await bumpMessageCount(session.id)
  } else {
    // Bot messages tetap di-log USER_MESSAGE dengan flag isBot — supaya bot
    // runner cron bisa cek timestamp last bot fire (anti-spam interval).
    // bumpMessageCount di-SKIP untuk gak polusi lead conversion metrics.
    await logLiveEvent({
      liveSessionId: session.id,
      type: 'USER_MESSAGE',
      payload: {
        text: message,
        customerName: parsed.data.customerName ?? 'bot',
        isBot: true,
      },
    })
  }

  // Fetch products fresh tiap call — supaya update stok / harga / flash sale
  // di owner dashboard langsung kepakai oleh Claude.
  const products = await prisma.product.findMany({
    where: { id: { in: room.productIds }, isActive: true },
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
  const order = new Map(room.productIds.map((id, i) => [id, i]))
  products.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999))

  const nowMs = Date.now()
  const liveProducts: LiveProduct[] = products.map((p) => {
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

  // ─────────────────────────────────────────
  // SPRINT 4: NATIVE_LIBRARY mode — match clip → return mode='clip' response.
  // Skip TTS pipeline entirely (audio sudah bonded di MP4).
  // ─────────────────────────────────────────
  if (room.hostTemplate?.mode === 'NATIVE_LIBRARY') {
    const { matchClip } = await import('@/lib/services/clip-library/match')
    const matched = await matchClip({
      hostTemplateId: room.hostTemplate.id,
      question: message,
      liveSessionId: session.id,
      // M5: charge embed cost ke room owner per customer query.
      ownerUserId: room.userId,
    })
    if (matched) {
      await logLiveEvent({
        liveSessionId: session.id,
        type: 'AI_MESSAGE',
        payload: {
          mode: 'clip',
          clipId: matched.clipId,
          confidence: matched.confidence,
          isFallback: matched.isFallback,
          transcript: matched.transcript.slice(0, 200),
        },
      })
      if (!isBot) await bumpMessageCount(session.id)
      return jsonOk({
        mode: 'clip',
        clip: {
          id: matched.clipId,
          videoUrl: matched.videoUrl,
          audioUrl: matched.audioUrl,
          transcript: matched.transcript,
          category: matched.category,
          durationMs: matched.durationMs,
          confidence: matched.confidence,
          isFallback: matched.isFallback,
        },
      })
    }
    // Tidak ada match (klip kosong / belum di-embed) — fallback ke text only.
    await logLiveEvent({
      liveSessionId: session.id,
      type: 'AI_ERROR',
      payload: { reason: 'native_library_no_match', message: 'Klip library kosong' },
    })
    return jsonOk({
      mode: 'text-only',
      reply: 'Bentar ya kak, host lagi siap-siap...',
      sentences: [],
      tokensCharged: 0,
    })
  }

  let reply
  try {
    // Asker name = nama yang akan disapa host di balasan.
    // - Bot turn: pakai nama bot dari body (mis "Bu Yanti") — JANGAN session.customerName
    //   (yang itu nama customer asli, gak relate sama bot).
    // - Real customer turn: session.customerName (persisted) > body fallback.
    const askerName = isBot
      ? parsed.data.customerName ?? null
      : session.customerName ?? parsed.data.customerName ?? null
    reply = await generateLiveReply({
      ownerUserId: room.userId,
      roomId: room.id,
      systemPromptBase: room.systemPrompt,
      products: liveProducts,
      message,
      history,
      model: room.chatModel,
      temperature: room.chatTemperature,
      customerName: askerName,
    })
  } catch (err) {
    if (err instanceof InsufficientBalanceError) {
      await logLiveEvent({
        liveSessionId: session.id,
        type: 'AI_INSUFFICIENT_BALANCE',
        payload: { tokensRequired: err.tokensRequired },
      })
      return jsonError(
        'Live sedang menunggu top-up. Coba beberapa menit lagi.',
        402,
      )
    }
    console.error('[POST /api/live/[slug]/chat] Claude gagal:', err)
    await logLiveEvent({
      liveSessionId: session.id,
      type: 'AI_ERROR',
      payload: { message: (err as Error).message.slice(0, 500) },
    })
    return jsonError(
      `AI gagal balas: ${(err as Error).message.slice(0, 200)}`,
      500,
    )
  }

  // Log AI message + bump count. Sukses tetap log tanpa nunggu TTS.
  await logLiveEvent({
    liveSessionId: session.id,
    type: 'AI_MESSAGE',
    payload: {
      text: reply.reply,
      tokensCharged: reply.charge.tokensCharged,
      modelName: reply.charge.modelName,
    },
  })
  await bumpMessageCount(session.id)

  // TTS per kalimat — paralel. Kalau gagal, return text tanpa audio supaya
  // customer tetap bisa baca (graceful degrade).
  let sentences: Array<{ text: string; audioUrl: string | null }>
  try {
    const audios = await generateLiveTtsBatch({
      sentences: reply.sentences,
      voice: room.ttsVoice,
      instructions: room.ttsInstructions ?? undefined,
      speed: room.ttsSpeed,
      pitchOffset: room.ttsPitchOffset,
      expressiveness: room.ttsExpressiveness,
      // M5 2026-06-05: charge ke room owner per char (anti-cost-leak).
      // Cache hit gak charge ulang. Insufficient balance → catch dan
      // graceful degrade ke text-only di bawah.
      userId: room.userId,
      subjectType: 'LIVE_TTS',
      subjectId: session.id,
    })
    sentences = reply.sentences.map((text, i) => ({
      text,
      audioUrl: audios[i]?.url ?? null,
    }))
  } catch (err) {
    console.warn('[live-chat] TTS gagal — return text-only:', (err as Error).message)
    sentences = reply.sentences.map((text) => ({ text, audioUrl: null }))
  }

  return jsonOk({
    mode: 'tts',
    reply: reply.reply,
    sentences,
    tokensCharged: reply.charge.tokensCharged,
  })
}
