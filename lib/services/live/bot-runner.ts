// Server-side bot runner — auto fire pesan bot ke live rooms aktif.
// Sebelumnya bot client-side di LiveRoomView, mati kalau page ditutup.
// Sekarang cron jalan tiap 30 detik, fire pesan untuk room yang:
//   - isActive = true
//   - botEnabled = true
//   - botPrompts.length > 0
//   - last bot message > N detik (per botIntervalMaxSec — anti-spam)
//   - last real user message > 60 detik (jangan ganggu real interaction)
//
// Pesan disubmit via internal call ke /api/live/[slug]/chat dengan isBot=true.
// Reply Claude auto-jalan (sesuai existing flow), masuk ke feed customer.

import { prisma } from '@/lib/prisma'

const BOT_VIEWER_NAMES = [
  'Bu Yanti', 'Pak Hendra', 'Mbak Sari', 'Dewi K.', 'Ari S.',
  'Rina', 'Bu Linda', 'Pak Roni', 'Aisyah', 'Bunda Tika',
  'Pak Heru', 'Mas Bayu', 'Cici T.', 'Ibu Wati', 'Adit',
  'Mbak Putri', 'Pak Yusuf', 'Diana K.', 'Bu Sinta', 'Reza',
]
const REAL_USER_PAUSE_MS = 60_000 // jangan ganggu kalau real user lagi nanya
const CLIENT_SESSION_PREFIX = 'bot-cron-' // virtual client session per room

// GUARDRAIL anti-bleed (2026-06-05). Tiap pesan bot memicu AI reply + TTS
// OpenAI. Tanpa cap, room yang lupa dimatikan bisa bocor berjam-jam (incident
// 09:33–15:05 = ~3500 pesan, ~$8). Kalau bot sudah kirim >= cap ini dalam 24
// jam, room auto-disable botEnabled. Self-heal: owner tinggal nyalakan lagi
// kalau memang mau lanjut demo.
const DAILY_BOT_CAP = 300

interface BotRunResult {
  checked: number
  triggered: number
  skipped: number
  failed: number
}

export async function runLiveBotTick(options: { baseUrl: string } = { baseUrl: 'http://localhost:3000' }): Promise<BotRunResult> {
  const result: BotRunResult = { checked: 0, triggered: 0, skipped: 0, failed: 0 }

  // Ambil semua live room aktif yang bot-enabled
  const rooms = await prisma.liveRoom.findMany({
    where: { isActive: true, botEnabled: true },
    select: {
      id: true,
      slug: true,
      botPrompts: true,
      botIntervalMinSec: true,
      botIntervalMaxSec: true,
    },
  })
  result.checked = rooms.length

  const now = Date.now()
  for (const room of rooms) {
    if (!room.botPrompts || room.botPrompts.length === 0) {
      result.skipped += 1
      continue
    }

    const sessionIds = await getRoomSessionIds(room.id)

    // GUARDRAIL: auto-off kalau bot sudah kirim >= DAILY_BOT_CAP pesan / 24 jam.
    // Cegah bleed OpenAI berjam-jam dari room yang lupa dimatikan.
    const botMsgCount24h = await prisma.liveEvent.count({
      where: {
        liveSessionId: { in: sessionIds },
        type: 'USER_MESSAGE',
        payload: { path: ['isBot'], equals: true },
        createdAt: { gte: new Date(now - 24 * 60 * 60 * 1000) },
      },
    })
    if (botMsgCount24h >= DAILY_BOT_CAP) {
      await prisma.liveRoom
        .update({ where: { id: room.id }, data: { botEnabled: false } })
        .catch(() => {})
      console.warn(
        `[bot-runner] room ${room.slug}: ${botMsgCount24h} pesan bot/24j ≥ cap ${DAILY_BOT_CAP} → auto-disable botEnabled (anti-bleed OpenAI)`,
      )
      result.skipped += 1
      continue
    }

    // Cek last activity di room — bot DAN real user
    const lastEvents = await prisma.liveEvent.findMany({
      where: {
        liveSessionId: { in: sessionIds },
        type: { in: ['USER_MESSAGE', 'AI_MESSAGE'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { type: true, createdAt: true, payload: true },
    })

    // Cek user real terakhir
    const lastReal = lastEvents.find(
      (e) => e.type === 'USER_MESSAGE' && !(e.payload as { isBot?: boolean } | null)?.isBot,
    )
    if (lastReal && now - lastReal.createdAt.getTime() < REAL_USER_PAUSE_MS) {
      result.skipped += 1
      continue
    }

    // Cek bot terakhir — anti-spam respect interval owner
    const lastBot = lastEvents.find(
      (e) =>
        e.type === 'USER_MESSAGE' && (e.payload as { isBot?: boolean } | null)?.isBot === true,
    )
    const minIntervalMs = Math.max(10, room.botIntervalMinSec) * 1000
    if (lastBot && now - lastBot.createdAt.getTime() < minIntervalMs) {
      result.skipped += 1
      continue
    }

    // Trigger! Random prompt + viewer name
    const prompt = room.botPrompts[Math.floor(Math.random() * room.botPrompts.length)]!
    const viewerName = BOT_VIEWER_NAMES[Math.floor(Math.random() * BOT_VIEWER_NAMES.length)]!

    try {
      const res = await fetch(`${options.baseUrl}/api/live/${encodeURIComponent(room.slug)}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: prompt,
          clientSessionId: CLIENT_SESSION_PREFIX + room.id,
          customerName: viewerName,
          isBot: true,
        }),
      })
      if (res.ok) {
        result.triggered += 1
      } else {
        result.failed += 1
        console.warn(`[bot-runner] room ${room.slug} chat HTTP ${res.status}`)
      }
    } catch (e) {
      result.failed += 1
      console.warn(`[bot-runner] room ${room.slug} fetch gagal:`, (e as Error).message)
    }
  }

  return result
}

// Helper: ambil semua sessionId untuk room dalam 1 jam terakhir
async function getRoomSessionIds(roomId: string): Promise<string[]> {
  const sessions = await prisma.liveSession.findMany({
    where: {
      liveRoomId: roomId,
      startedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }, // 1 jam window
    },
    select: { id: true },
    take: 50,
  })
  return sessions.map((s) => s.id)
}
