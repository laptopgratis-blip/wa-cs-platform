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

    // Session virtual bot dibuat SEKALI seumur hidup room (clientSessionId
    // 'bot-cron-<roomId>') — lookup langsung by unique key, TANPA window waktu.
    // BUG LAMA (fixed 2026-06-10): query session pakai filter startedAt >=
    // now-1jam, padahal startedAt session bot tidak pernah berubah → 1 jam
    // setelah dibuat, session bot keluar window → lastBot tidak ketemu → bot
    // fire TIAP tick & cap 24 jam tidak pernah kena (cost leak Claude+TTS).
    const botSession = await prisma.liveSession.findUnique({
      where: { clientSessionId: CLIENT_SESSION_PREFIX + room.id },
      select: { id: true },
    })

    if (botSession) {
      // GUARDRAIL: auto-off kalau bot sudah kirim >= DAILY_BOT_CAP pesan / 24 jam.
      // Cegah bleed OpenAI berjam-jam dari room yang lupa dimatikan.
      // Semua USER_MESSAGE di session virtual bot adalah pesan bot (session
      // ini hanya ditulis bot runner via chat route dengan isBot=true), jadi
      // tidak perlu filter JSON payload — count langsung pakai index
      // (liveSessionId, createdAt) yang sudah ada.
      const botMsgCount24h = await prisma.liveEvent.count({
        where: {
          liveSessionId: botSession.id,
          type: 'USER_MESSAGE',
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
    }

    // Pause kalau ada pesan user REAL < 60 detik terakhir — jangan ganggu
    // interaksi asli. Query by window createdAt (index type+createdAt) lewat
    // relasi session room, exclude session virtual bot.
    const recentRealMsg = await prisma.liveEvent.findFirst({
      where: {
        type: 'USER_MESSAGE',
        createdAt: { gte: new Date(now - REAL_USER_PAUSE_MS) },
        liveSession: { liveRoomId: room.id },
        ...(botSession ? { liveSessionId: { not: botSession.id } } : {}),
      },
      select: { id: true },
    })
    if (recentRealMsg) {
      result.skipped += 1
      continue
    }

    // Cek bot terakhir — anti-spam respect interval owner. Tanpa window
    // startedAt: ambil USER_MESSAGE terbaru di session virtual bot.
    if (botSession) {
      const lastBot = await prisma.liveEvent.findFirst({
        where: { liveSessionId: botSession.id, type: 'USER_MESSAGE' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      })
      const minIntervalMs = Math.max(10, room.botIntervalMinSec) * 1000
      if (lastBot && now - lastBot.createdAt.getTime() < minIntervalMs) {
        result.skipped += 1
        continue
      }
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
