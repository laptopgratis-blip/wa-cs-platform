// Entry point wa-service. Jalan di port 3001 (default).
// - Express HTTP API: dipanggil oleh Next.js untuk start/stop session.
// - Socket.io: streaming QR & status update ke browser.

import cors from 'cors'
import dotenv from 'dotenv'
import express, { type NextFunction, type Request, type Response } from 'express'
import { createHmac, timingSafeEqual } from 'node:crypto'
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

// Fail-closed di production: tanpa secret, semua endpoint internal terbuka
// (siapa pun bisa connect/disconnect/broadcast). Lebih baik refuse boot
// daripada jalan tanpa proteksi. Di dev tetap diizinkan (lihat requireSecret).
if (process.env.NODE_ENV === 'production' && !SECRET) {
  console.error(
    '[wa-service] FATAL: WA_SERVICE_SECRET wajib di-set saat NODE_ENV=production. ' +
      'Set env tersebut (sama dengan yang dipakai Next.js) lalu restart service.',
  )
  process.exit(1)
}
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

// Verifikasi token subscribe yang di-mint Next.js (lib/wa-socket-token.ts).
// Format: `${sessionId}.${exp}.${hmac}` — exp epoch detik, hmac =
// HMAC-SHA256(WA_SERVICE_SECRET, `${sessionId}.${exp}`) dalam hex.
// Tanpa token valid, siapa pun bisa join room dan mencuri QR pairing.
function verifySocketToken(
  sessionId: string,
  token: string,
): { ok: boolean; error?: string } {
  const parts = token.split('.')
  if (parts.length !== 3) {
    return { ok: false, error: 'format token tidak valid' }
  }
  const [tokenSessionId, expStr, signature] = parts as [string, string, string]
  if (tokenSessionId !== sessionId) {
    return { ok: false, error: 'token bukan untuk session ini' }
  }
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) {
    return { ok: false, error: 'token kedaluwarsa — minta token baru' }
  }
  const expectedHex = createHmac('sha256', SECRET)
    .update(`${tokenSessionId}.${expStr}`)
    .digest('hex')
  const expected = Buffer.from(expectedHex, 'hex')
  const actual = Buffer.from(signature, 'hex')
  // timingSafeEqual butuh panjang sama — cek dulu supaya tidak throw.
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, error: 'signature token tidak valid' }
  }
  return { ok: true }
}

io.on('connection', (socket) => {
  // Payload baru: { sessionId, token }. Payload lama (string polos) DITOLAK,
  // kecuali dev tanpa secret (DX lokal — wa-service lokal sering tanpa .env).
  socket.on(
    'subscribe',
    (payload: string | { sessionId?: unknown; token?: unknown }) => {
      let sessionId = ''
      let token = ''
      if (typeof payload === 'string') {
        sessionId = payload
      } else if (payload && typeof payload === 'object') {
        sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : ''
        token = typeof payload.token === 'string' ? payload.token : ''
      }
      if (!sessionId) return

      const devNoSecret = process.env.NODE_ENV !== 'production' && !SECRET
      if (devNoSecret) {
        // Tanpa secret tidak ada yang bisa diverifikasi — izinkan (dev only),
        // tapi tetap kasih jejak di log.
        console.warn(
          `[wa-service] subscribe tanpa verifikasi (dev, SECRET kosong): ${sessionId}`,
        )
      } else if (!token) {
        console.warn(
          `[wa-service] subscribe tanpa token DITOLAK (session: ${sessionId})`,
        )
        socket.emit('subscribe-error', {
          sessionId,
          error: 'token wajib untuk subscribe',
        })
        return
      } else {
        const verified = verifySocketToken(sessionId, token)
        if (!verified.ok) {
          console.warn(
            `[wa-service] subscribe token invalid (session: ${sessionId}): ${verified.error}`,
          )
          socket.emit('subscribe-error', {
            sessionId,
            error: verified.error ?? 'token tidak valid',
          })
          return
        }
      }

      socket.join(`session:${sessionId}`)
      // Kirim state terkini langsung supaya UI tidak kosong sebelum event
      // berikut. Termasuk QR kalau sudah ada — race-condition fix: kalau
      // Baileys keburu generate QR sebelum client subscribe, client tetap
      // dapat QR sekarang tanpa harus menunggu QR refresh ~20s.
      const state = manager.get(sessionId)
      if (state) {
        socket.emit('status', { sessionId, status: state.status })
        if (state.qr && state.qrDataUrl) {
          socket.emit('qr', {
            sessionId,
            qr: state.qr,
            qrDataUrl: state.qrDataUrl,
          })
        }
      }
    },
  )
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
async function shutdown(signal: string, exitCode = 0) {
  console.log(`[wa-service] menerima ${signal}, shutting down...`)
  for (const state of manager.list()) {
    await manager.disconnect(state.sessionId, false).catch(() => {})
  }
  httpServer.close(() => process.exit(exitCode))
  // Hard exit kalau close menggantung — selalu non-zero supaya terdeteksi abnormal.
  setTimeout(() => process.exit(exitCode === 0 ? 1 : exitCode), 5000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// ── Crash isolation ─────────────────────────────────────────────────────────
// Satu promise gagal tak tertangani (mis. error Baileys di satu sesi) TIDAK
// boleh menjatuhkan seluruh service — multi-tenant, sesi lain harus tetap
// hidup. Log detail supaya tetap kelihatan di monitoring.
process.on('unhandledRejection', (reason) => {
  console.error('[wa-service] unhandledRejection (diisolasi, service lanjut):', reason)
})
// uncaughtException: state proses tidak bisa dijamin sehat — log, coba
// graceful shutdown singkat (flush creds), lalu exit(1) supaya docker/
// supervisor restart proses dengan bersih.
process.on('uncaughtException', (err) => {
  console.error('[wa-service] uncaughtException — restart dibutuhkan:', err)
  shutdown('uncaughtException', 1).catch(() => process.exit(1))
})
