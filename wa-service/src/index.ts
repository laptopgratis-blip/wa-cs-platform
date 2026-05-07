// Entry point wa-service. Jalan di port 3001 (default).
// - Express HTTP API: dipanggil oleh Next.js untuk start/stop session.
// - Socket.io: streaming QR & status update ke browser.

import cors from 'cors'
import dotenv from 'dotenv'
import express, { type NextFunction, type Request, type Response } from 'express'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server as IOServer } from 'socket.io'

import type { ConnectRequest, DisconnectRequest } from './types.js'
import { WaManager } from './wa-manager.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load env: wa-service tidak punya .env sendiri, ambil dari root project.
// Urutan override: .env.local > .env > .env di wa-service (kalau ada).
const ROOT = path.resolve(__dirname, '../..')
dotenv.config({ path: path.join(ROOT, '.env.local'), override: true })
dotenv.config({ path: path.join(ROOT, '.env'), override: false })
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: false })

const PORT = Number(process.env.WA_SERVICE_PORT ?? 3001)
const SECRET = process.env.WA_SERVICE_SECRET ?? ''
const SESSIONS_DIR = path.resolve(__dirname, '../sessions')
// Origins yang boleh konek (Next.js dev + custom). '*' kalau dev.
const CORS_ORIGIN =
  process.env.WA_SERVICE_CORS_ORIGIN?.split(',').map((s) => s.trim()) ??
  ['http://localhost:3000']

const app = express()
const httpServer = createServer(app)
const io = new IOServer(httpServer, {
  cors: { origin: CORS_ORIGIN, credentials: true },
})

const manager = new WaManager(io, SESSIONS_DIR)

app.use(cors({ origin: CORS_ORIGIN, credentials: true }))
app.use(express.json({ limit: '256kb' }))

// Middleware proteksi: Next.js harus kirim header `x-service-secret`.
// Kalau SECRET kosong (mis. dev tanpa konfigurasi), tetap diizinkan tapi log warning.
function requireSecret(req: Request, res: Response, next: NextFunction): void {
  if (!SECRET) {
    // eslint-disable-next-line no-console
    console.warn('[wa-service] WA_SERVICE_SECRET kosong — endpoint tidak terproteksi')
    return next()
  }
  if (req.header('x-service-secret') !== SECRET) {
    res.status(401).json({ success: false, error: 'unauthorized' })
    return
  }
  next()
}

// Healthcheck terbuka — supaya frontend/CI bisa probe tanpa secret.
app.get('/health', (_req, res) => {
  res.json({ success: true, data: { ok: true, sessions: manager.list().length } })
})

// List semua sesi yang aktif di memori (sudah di-restore atau baru di-connect).
app.get('/sessions', requireSecret, (_req, res) => {
  res.json({ success: true, data: manager.list() })
})

app.get('/sessions/:sessionId', requireSecret, (req, res) => {
  const sessionId = String(req.params.sessionId ?? '')
  const state = manager.get(sessionId)
  if (!state) {
    res.status(404).json({ success: false, error: 'session tidak ditemukan' })
    return
  }
  res.json({ success: true, data: state })
})

app.post('/sessions/connect', requireSecret, async (req, res) => {
  const body = req.body as Partial<ConnectRequest>
  if (!body?.sessionId || typeof body.sessionId !== 'string') {
    res.status(400).json({ success: false, error: 'sessionId wajib diisi' })
    return
  }
  try {
    const state = await manager.connect(body.sessionId)
    res.json({ success: true, data: state })
  } catch (err) {
    console.error('[wa-service] /sessions/connect error:', err)
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

app.post('/sessions/:sessionId/broadcast', requireSecret, async (req, res) => {
  const sessionId = String(req.params.sessionId ?? '')
  const body = req.body as
    | {
        broadcastId?: string
        items?: { phoneNumber: string; content: string }[]
      }
    | undefined
  if (
    !body?.broadcastId ||
    !Array.isArray(body.items) ||
    body.items.length === 0
  ) {
    res
      .status(400)
      .json({ success: false, error: 'broadcastId dan items wajib' })
    return
  }
  // Validasi awal — kalau session tidak siap, jangan jalan.
  const state = manager.get(sessionId)
  if (!state || state.status !== 'CONNECTED') {
    res.status(400).json({
      success: false,
      error: `session belum siap (status: ${state?.status ?? 'tidak ditemukan'})`,
    })
    return
  }
  if (manager.isBroadcastRunning(body.broadcastId)) {
    res.status(409).json({ success: false, error: 'broadcast sudah jalan' })
    return
  }
  // Trigger async — tidak block response.
  manager
    .runBroadcast(sessionId, body.broadcastId, body.items)
    .catch((err) =>
      console.error('[wa-service] runBroadcast error:', err),
    )
  res.json({
    success: true,
    data: { broadcastId: body.broadcastId, total: body.items.length },
  })
})

app.post('/broadcasts/:broadcastId/cancel', requireSecret, (req, res) => {
  const broadcastId = String(req.params.broadcastId ?? '')
  const cancelled = manager.cancelBroadcast(broadcastId)
  res.json({ success: true, data: { broadcastId, cancelled } })
})

// Resolve satu atau beberapa LID JID ke nomor PN, dipakai oleh script migration
// merge-lid-contacts.js. Body: { sessionId, lids: string[] }.
// Response.results[i].pn = null kalau Baileys tidak punya mappingnya.
app.post('/lid/resolve', requireSecret, async (req, res) => {
  const body = req.body as
    | { sessionId?: string; lids?: string[] }
    | undefined
  if (
    !body?.sessionId ||
    !Array.isArray(body.lids) ||
    body.lids.length === 0
  ) {
    res
      .status(400)
      .json({ success: false, error: 'sessionId dan lids[] wajib' })
    return
  }
  const sock = manager.getSocket(body.sessionId)
  // Lazy import supaya unit test gampang stub kalau perlu.
  const { resolvePhoneNumber } = await import('./lib/jid-resolver.js')
  const results: Array<{ lid: string; pn: string | null }> = []
  for (const lid of body.lids) {
    if (typeof lid !== 'string' || !lid) {
      results.push({ lid: String(lid), pn: null })
      continue
    }
    try {
      const resolved = await resolvePhoneNumber(sock, lid)
      // Anggap berhasil hanya kalau hasilnya BUKAN LID lagi (artinya beneran
      // ke-resolve ke nomor). Kalau sama (fallback), tandai null.
      const isPn = /^\d+$/.test(resolved)
      results.push({ lid, pn: isPn ? resolved : null })
    } catch (err) {
      console.error('[wa-service] /lid/resolve error:', err)
      results.push({ lid, pn: null })
    }
  }
  res.json({ success: true, data: { results } })
})

app.post('/sessions/:sessionId/send-message', requireSecret, async (req, res) => {
  const sessionId = String(req.params.sessionId ?? '')
  const body = req.body as { phoneNumber?: string; content?: string } | undefined
  if (!body?.phoneNumber || !body?.content) {
    res
      .status(400)
      .json({ success: false, error: 'phoneNumber dan content wajib diisi' })
    return
  }
  const result = await manager.sendText(sessionId, body.phoneNumber, body.content)
  if (!result.ok) {
    res.status(400).json({ success: false, error: result.error || 'gagal kirim' })
    return
  }
  res.json({
    success: true,
    data: {
      sessionId,
      phoneNumber: body.phoneNumber,
      // ID Baileys dari pesan yang baru dikirim — caller simpan sebagai
      // externalMsgId untuk dedup saat event messages.upsert fromMe masuk.
      messageId: result.messageId ?? null,
    },
  })
})

// Dev-only endpoint untuk test flow incoming message tanpa Baileys.
// Trigger save → cek soul/model → cek token → AI → potong token → save AI.
// HANYA aktif di non-production (dev/staging).
app.post('/sessions/:sessionId/test-message', requireSecret, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(404).json({ success: false, error: 'not found' })
    return
  }
  const sessionId = String(req.params.sessionId ?? '')
  const body = req.body as { from?: string; message?: string } | undefined
  if (!body?.from || !body?.message) {
    res
      .status(400)
      .json({ success: false, error: 'from dan message wajib diisi' })
    return
  }
  if (!/^\d{8,15}$/.test(body.from)) {
    res
      .status(400)
      .json({ success: false, error: 'from harus 8-15 digit (mis. 628111222333)' })
    return
  }
  const result = await manager.simulateIncomingMessage({
    sessionId,
    from: body.from,
    message: body.message,
  })
  res.json({ success: true, data: result })
})

app.post('/sessions/disconnect', requireSecret, async (req, res) => {
  const body = req.body as Partial<DisconnectRequest>
  if (!body?.sessionId || typeof body.sessionId !== 'string') {
    res.status(400).json({ success: false, error: 'sessionId wajib diisi' })
    return
  }
  try {
    const state = await manager.disconnect(body.sessionId, Boolean(body.wipe))
    res.json({ success: true, data: state })
  } catch (err) {
    console.error('[wa-service] /sessions/disconnect error:', err)
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// ── Socket.io: client join room sesi spesifik untuk dapat event QR/status ──
io.on('connection', (socket) => {
  socket.on('subscribe', (sessionId: string) => {
    if (typeof sessionId !== 'string' || !sessionId) return
    socket.join(`session:${sessionId}`)
    // Kirim state terkini langsung supaya UI tidak kosong sebelum event berikut.
    const state = manager.get(sessionId)
    if (state) socket.emit('status', { sessionId, status: state.status })
  })
  socket.on('unsubscribe', (sessionId: string) => {
    if (typeof sessionId !== 'string' || !sessionId) return
    socket.leave(`session:${sessionId}`)
  })
})

// Boot: restore semua sesi yang punya credentials di disk.
manager
  .restoreAll()
  .then((restored) => {
    if (restored.length > 0) {
      console.log(`[wa-service] restored ${restored.length} session(s):`, restored)
    }
  })
  .catch((err) => {
    console.error('[wa-service] restoreAll gagal:', err)
  })

httpServer.listen(PORT, () => {
  console.log(`[wa-service] listening on http://localhost:${PORT}`)
  console.log(`[wa-service] sessions dir: ${SESSIONS_DIR}`)
  if (!SECRET) {
    console.warn('[wa-service] berjalan tanpa secret — set WA_SERVICE_SECRET di env')
  }
})

// Graceful shutdown: putus semua socket Baileys supaya credentials ter-flush.
async function shutdown(signal: string) {
  console.log(`[wa-service] menerima ${signal}, shutting down...`)
  for (const state of manager.list()) {
    await manager.disconnect(state.sessionId, false).catch(() => {})
  }
  httpServer.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 5000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
