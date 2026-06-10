// POST /api/live/[slug]/chat — kirim pesan customer ke PANGGUNG BERSAMA.
//
// Sejak 2026-06-10 (shared live stage): pesan TIDAK lagi dijawab per-device.
// Pesan masuk ANTRIAN global → satu host loop server menjawab antre & semua
// device menonton via GET /stage. Endpoint ini hanya: validasi, rate limit,
// catat session + USER_MESSAGE (utk feed), enqueue, lalu trigger advanceStage.
//
// Response: { queued: true, advanced } — bukan lagi { reply, sentences }.
import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api'
import { getClientIp } from '@/lib/client-ip'
import { prisma } from '@/lib/prisma'
import {
  checkRateLimit,
  checkRoomRateLimit,
  maybeCleanup,
} from '@/lib/services/live/rate-limit'
import { advanceStage, enqueueQuestion } from '@/lib/services/live/stage'
import {
  bumpMessageCount,
  ensureLiveSession,
  logLiveEvent,
  makeFingerprint,
} from '@/lib/services/live/tangkap'

const chatSchema = z.object({
  message: z.string().trim().min(1).max(500),
  clientSessionId: z.string().trim().min(8).max(64),
  customerName: z.string().trim().min(1).max(80).optional(),
  customerPhone: z.string().trim().min(8).max(20).optional(),
  isBot: z.boolean().optional(),
  // history masih diterima utk kompat client lama, tapi diabaikan — konteks
  // multi-turn sekarang dibangun server-side dari event room (lihat stage.ts).
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
    select: { id: true, userId: true, isActive: true },
  })
  if (!room) return jsonError('Live room tidak ditemukan', 404)
  if (!room.isActive) return jsonError('Live sedang offline', 410)

  // Tangkap: ensure session + log USER_MESSAGE (feed). Bot tidak bind nama/phone
  // ke session & skip counter (jaga metrics lead tetap bersih).
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

  // Nama yang akan disapa host di balasan (atribusi caption "Menjawab X").
  const askerName = isBot
    ? parsed.data.customerName ?? null
    : session.customerName ?? parsed.data.customerName ?? null

  // Masuk antrian global. Bot di-drop kalau antrian penuh (real user diutamakan).
  const queued = await enqueueQuestion({
    liveRoomId: room.id,
    liveSessionId: session.id,
    askerName,
    isBot: Boolean(isBot),
    questionText: message,
  })
  if (!queued) {
    return jsonOk({ queued: false, reason: 'queue-full' })
  }

  // Trigger host loop: kalau idle → mulai generate; kalau sibuk → antre,
  // dilanjut oleh cron tick saat jawaban sekarang selesai.
  const adv = await advanceStage(room.id)
  return jsonOk({ queued: true, advanced: adv.advanced })
}
