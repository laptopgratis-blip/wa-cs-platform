// Manager untuk semua sesi Baileys. Bertanggung jawab:
// 1. Spawn / restore satu sesi WA per `sessionId`
// 2. Persist credentials ke folder `sessions/<sessionId>/`
// 3. Emit event Socket.io: qr / status / connected / disconnected
// 4. Auto-reconnect kalau socket putus tanpa logout
// 5. Handle pesan masuk → save → AI reply → potong token → kirim balasan

import {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeWASocket,
  proto,
  useMultiFileAuthState,
  type WAMessage,
  type WASocket,
  type WAVersion,
} from 'baileys'
import fs from 'node:fs/promises'
import path from 'node:path'
import P from 'pino'
import qrcode from 'qrcode'
import type { Server as IOServer } from 'socket.io'

import { generateReply, type AiUsage } from './ai-handler.js'
import {
  internalApi,
  type InternalMessageHistoryItem,
  type InternalSoulConfig,
} from './internal-api.js'
import { phoneToSendJid, resolvePhoneNumber } from './lib/jid-resolver.js'
import { tokenChecker } from './token-checker.js'

// Cache version Baileys di module-level. fetchLatestBaileysVersion() HTTP
// ke GitHub setiap call — bisa 1-5s lat. Cache 1 jam, refresh background.
// Kalau call pertama belum selesai, semua connect await Promise yang sama.
const BAILEYS_VERSION_TTL_MS = 60 * 60 * 1000
let cachedVersion: { value: WAVersion | undefined; fetchedAt: number } | null = null
let inflightVersionFetch: Promise<WAVersion | undefined> | null = null

// ── Konstanta reconnect & antrian pesan ─────────────────────────────────────
// Backoff eksponensial untuk reconnect non-restartRequired: 1.5s → 3s → 6s →
// ... cap 60s, max 10 percobaan beruntun. restartRequired (515, normal
// pasca-pairing) tetap fast-reconnect tanpa dihitung sebagai kegagalan.
const RECONNECT_BASE_DELAY_MS = 1500
// Cap delay 5 menit (bukan 60 dtk): saat 261 sesi drop serentak (restart /
// throttle massal WA), reason 408 timeout bertubi. Backoff panjang + cap tinggi
// bikin sesi BERTAHAN melewati window throttle alih-alih menyerah cepat.
const RECONNECT_MAX_DELAY_MS = 300_000
// Cap 30 percobaan (bukan 10): dengan max delay 5 menit, ~30 percobaan =
// retry hampir 2 jam sebelum ERROR — cukup melewati throttle massal, tapi sesi
// yang benar-benar mati tetap akhirnya berhenti (tidak hammer selamanya).
const MAX_RECONNECT_ATTEMPTS = 30
const FAST_RECONNECT_DELAY_MS = 1500

// Hitung delay reconnect percobaan ke-N (1-based). Jitter LEBAR (±50%) + stagger
// absolut pada gelombang awal supaya banyak sesi yang drop berbarengan TIDAK
// reconnect serempak (thundering herd → throttle WA → gagal massal). Tanpa ini,
// restart 261 sesi membuat semua menghantam WA bersamaan dan kena 408.
function reconnectDelayMs(attempt: number): number {
  const exp = Math.min(
    RECONNECT_MAX_DELAY_MS,
    RECONNECT_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1),
  )
  const jitter = exp * 0.5 * (Math.random() * 2 - 1)
  // Percobaan awal (saat herd paling padat) disebar tambahan 0-10 dtk.
  const stagger = attempt <= 3 ? Math.random() * 10_000 : 0
  return Math.max(500, Math.round(exp + jitter + stagger))
}

// Batas putaran drain antrian pesan beruntun per kontak (lihat
// handleIncomingMessage). Sisa antrian di luar batas tetap tersimpan di CRM —
// hanya tidak dapat balasan AI tambahan.
const MAX_DRAIN_ROUNDS = 3

// Watchdog: batas waktu satu pipeline balasan (termasuk drain). Kalau ada await
// yang hang (mis. internal API tak responsif), lock `inFlight` kontak bisa
// terkunci permanen → kontak tak pernah dibalas lagi. Saat timeout, lock dilepas.
const PIPELINE_TIMEOUT_MS = 90_000

async function getBaileysVersionCached(): Promise<WAVersion | undefined> {
  const now = Date.now()
  if (cachedVersion && now - cachedVersion.fetchedAt < BAILEYS_VERSION_TTL_MS) {
    return cachedVersion.value
  }
  if (inflightVersionFetch) return inflightVersionFetch
  inflightVersionFetch = (async () => {
    try {
      // Timeout 3 detik supaya tidak block ke koneksi WA — Baileys fallback ke
      // versi bawaan kalau undefined.
      const fetched = await Promise.race([
        fetchLatestBaileysVersion().then((r) => r.version),
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 3000)),
      ])
      cachedVersion = { value: fetched, fetchedAt: Date.now() }
      return fetched
    } catch {
      cachedVersion = { value: undefined, fetchedAt: Date.now() }
      return undefined
    } finally {
      inflightVersionFetch = null
    }
  })()
  return inflightVersionFetch
}

// Build cost fields untuk saveMessage dari real usage AI provider + hasil
// chargeCsReply yang sudah dihitung server (tokensCharged, apiCostRp,
// revenueRp, profitRp via skema fair-pricing AiFeatureConfig['CS_REPLY']).
interface ChargeFields {
  tokensCharged: number
  apiCostRp: number
  revenueRp: number
  profitRp: number
}

function buildCostFields(
  usage: AiUsage | undefined,
  charge: ChargeFields,
): {
  apiInputTokens: number
  apiOutputTokens: number
  apiCostRp: number
  tokensCharged: number
  revenueRp: number
  profitRp: number
} {
  return {
    apiInputTokens: usage?.inputTokens ?? 0,
    apiOutputTokens: usage?.outputTokens ?? 0,
    apiCostRp: charge.apiCostRp,
    tokensCharged: charge.tokensCharged,
    revenueRp: charge.revenueRp,
    profitRp: charge.profitRp,
  }
}
import type {
  ConnectedEvent,
  DisconnectedEvent,
  QrEvent,
  SessionState,
  StatusEvent,
} from './types.js'

// Payload event Socket.io untuk inbox realtime (server → client). Didefinisikan
// di sini (bukan types.ts) supaya kontrak inbox terlokalisir di wa-manager —
// frontend cocokkan bentuk ini saat listen 'inbox:message' / 'inbox:status'.
interface InboxMessageEvent {
  sessionId: string
  contactId: string
  phoneNumber: string
  name: string | null
  message: {
    id: string | null // messageId dari DB (hasil saveMessage), null kalau gagal
    content: string
    role: 'USER' | 'AI' | 'AGENT' | 'HUMAN'
    status: 'SENT' | 'FAILED'
    source: string | null
    createdAt: string // ISO string
  }
}

interface InboxStatusEvent {
  sessionId: string
  externalMsgId: string
  status: 'FAILED'
}

interface SessionEntry {
  state: SessionState
  socket: WASocket | null
  // Kalau true: jangan auto-reconnect saat connection.update close (user minta disconnect).
  intentionallyClosed: boolean
  // Set kontak yang sedang diproses AI (kunci: phoneNumber). Hindari double-reply
  // kalau customer kirim banyak pesan beruntun.
  inFlight: Set<string>
  // Antrian pesan customer per kontak (kunci: phoneNumber) yang masuk SAAT
  // pipeline AI masih jalan. Pesan sudah disimpan ke CRM saat enqueue —
  // setelah pipeline selesai, antrian di-drain jadi satu putaran AI gabungan
  // (lihat handleIncomingMessage). Jangan drop pesan beruntun!
  pendingByContact: Map<string, string[]>
  // Hitungan percobaan reconnect beruntun — reset saat connection open sukses.
  // Dipakai untuk exponential backoff + stop setelah MAX_RECONNECT_ATTEMPTS.
  reconnectAttempts: number
  // ID pesan outgoing yang baru-baru ini kita kirim sendiri (msg.key.id). Dipakai
  // untuk dedup event messages.upsert fromMe — cegah race antara save ke DB di
  // Next.js dan event echo dari Baileys. Entry di-evict setelah 60 detik.
  recentlySentIds: Set<string>
}

export class WaManager {
  private sessions = new Map<string, SessionEntry>()
  private readonly sessionsDir: string

  constructor(
    private readonly io: IOServer,
    sessionsDir: string,
  ) {
    this.sessionsDir = sessionsDir
  }

  // Restore semua sesi yang punya credentials di disk saat boot.
  async restoreAll(): Promise<string[]> {
    await fs.mkdir(this.sessionsDir, { recursive: true })
    const entries = await fs.readdir(this.sessionsDir, { withFileTypes: true })
    const restored: string[] = []
    let i = 0
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      try {
        await this.connect(entry.name)
        restored.push(entry.name)
        // Stagger antar-restore (~80-200ms): dengan ratusan sesi, connect
        // back-to-back menghantam WA sekaligus → throttle/408 massal. Sebar
        // gelombang boot supaya server WA tidak menolak koneksi.
        i += 1
        if (i % 5 === 0) await sleep(120 + Math.random() * 120)
      } catch (err) {
        console.error(`[wa-manager] gagal restore ${entry.name}:`, err)
      }
    }
    return restored
  }

  list(): SessionState[] {
    return [...this.sessions.values()].map((s) => s.state)
  }

  get(sessionId: string): SessionState | null {
    return this.sessions.get(sessionId)?.state ?? null
  }

  // Akses socket Baileys (read-only) untuk operasi yang butuh signalRepository,
  // mis. LID resolution di endpoint /lid/resolve. Return null kalau session
  // belum di-restore atau socket-nya putus.
  getSocket(sessionId: string): WASocket | null {
    return this.sessions.get(sessionId)?.socket ?? null
  }

  // Promise connect yang sedang in-flight per sessionId. Anti race
  // double-socket: dua caller connect() bersamaan (mis. user klik connect +
  // auto-reconnect) dapat promise yang SAMA — tanpa ini, await di antara guard
  // idempoten dan sessions.set bisa bikin dua makeWASocket untuk satu sesi.
  // Pola sama dengan getBaileysVersionCached di atas.
  private connectPromises = new Map<string, Promise<SessionState>>()

  // Mulai (atau lanjutkan) satu sesi. Idempoten — kalau sudah jalan, return state saat ini.
  async connect(sessionId: string): Promise<SessionState> {
    const inflight = this.connectPromises.get(sessionId)
    if (inflight) return inflight
    const promise = this.doConnect(sessionId).finally(() => {
      this.connectPromises.delete(sessionId)
    })
    this.connectPromises.set(sessionId, promise)
    return promise
  }

  private async doConnect(sessionId: string): Promise<SessionState> {
    const existing = this.sessions.get(sessionId)
    if (existing && existing.socket) {
      return existing.state
    }

    const folder = path.join(this.sessionsDir, sessionId)
    await fs.mkdir(folder, { recursive: true })

    const { state: authState, saveCreds } = await useMultiFileAuthState(folder)
    // Pakai cached version (lihat getBaileysVersionCached di atas). Hindari
    // HTTP GitHub call setiap session baru — bottleneck utama QR latency.
    const version = await getBaileysVersionCached()

    const entry: SessionEntry = existing ?? {
      state: this.makeInitialState(sessionId),
      socket: null,
      intentionallyClosed: false,
      inFlight: new Set<string>(),
      pendingByContact: new Map<string, string[]>(),
      reconnectAttempts: 0,
      recentlySentIds: new Set<string>(),
    }
    entry.intentionallyClosed = false
    this.updateState(entry, { status: 'CONNECTING' })
    this.sessions.set(sessionId, entry)

    const sock = makeWASocket({
      auth: authState,
      version,
      printQRInTerminal: false,
      browser: ['Hulao', 'Chrome', '1.0.0'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
      logger: P({ level: 'warn' }),
    })
    entry.socket = sock

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('messages.upsert', (event) => {
      // Hanya pesan baru (bukan history sync). Process async, jangan block.
      if (event.type !== 'notify') return
      for (const msg of event.messages) {
        this.handleIncomingMessage(entry, msg).catch((err) => {
          console.error(`[wa-manager:${sessionId}] handleIncomingMessage:`, err)
        })
      }
    })

    // Ack pengiriman dari WhatsApp. Status ERROR pada pesan outgoing (fromMe)
    // berarti pesan GAGAL terkirim walau sendMessage tadinya sukses (mis. nomor
    // diblokir / tidak ada WA). Tandai FAILED di DB + emit 'inbox:status' supaya
    // inbox web tidak menampilkan SENT palsu. Non-blocking — jangan await di
    // dalam loop yang mem-block event handler.
    sock.ev.on('messages.update', (updates) => {
      for (const update of updates) {
        if (update.update.status !== proto.WebMessageInfo.Status.ERROR) continue
        if (!update.key.fromMe) continue
        const externalMsgId = update.key.id
        if (!externalMsgId) continue
        console.warn(
          `[wa-manager:${sessionId}] ack ERROR → FAILED (id=${externalMsgId})`,
        )
        internalApi
          .markMessageStatus({ externalMsgId, status: 'FAILED' })
          .catch((err) =>
            console.error(
              `[wa-manager:${sessionId}] markMessageStatus FAILED gagal:`,
              err,
            ),
          )
        this.emit<InboxStatusEvent>('inbox:status', {
          sessionId,
          externalMsgId,
          status: 'FAILED',
        })
      }
    })

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        try {
          const qrDataUrl = await qrcode.toDataURL(qr, { margin: 1, width: 320 })
          this.updateState(entry, {
            status: 'WAITING_QR',
            qr,
            qrDataUrl,
            lastError: null,
          })
          this.emit<QrEvent>('qr', { sessionId, qr, qrDataUrl })
        } catch (err) {
          console.error(`[wa-manager:${sessionId}] gagal generate QR:`, err)
        }
      }

      if (connection === 'open') {
        // Koneksi sukses — reset counter backoff supaya disconnect berikutnya
        // mulai lagi dari delay terkecil.
        entry.reconnectAttempts = 0
        const me = sock.user
        const phoneNumber = me?.id ? me.id.split(':')[0]?.split('@')[0] ?? null : null
        this.updateState(entry, {
          status: 'CONNECTED',
          phoneNumber,
          displayName: me?.name ?? null,
          qr: null,
          qrDataUrl: null,
          lastError: null,
        })
        this.emit<ConnectedEvent>('connected', {
          sessionId,
          phoneNumber: phoneNumber ?? '',
          displayName: me?.name ?? null,
        })
      }

      if (connection === 'close') {
        // Boom error punya .output.statusCode; error biasa kadang punya .code.
        const errAny = lastDisconnect?.error as
          | { output?: { statusCode?: number }; code?: number; message?: string }
          | undefined
        const reasonCode = errAny?.output?.statusCode ?? errAny?.code
        const isLoggedOut = reasonCode === DisconnectReason.loggedOut
        const reasonText = errAny?.message ?? null

        entry.socket = null

        if (isLoggedOut || entry.intentionallyClosed) {
          this.updateState(entry, {
            status: 'DISCONNECTED',
            qr: null,
            qrDataUrl: null,
            lastError: reasonText,
          })
          this.emit<DisconnectedEvent>('disconnected', {
            sessionId,
            reason: reasonText,
          })
          if (isLoggedOut) {
            await this.wipeFolder(sessionId).catch(() => {})
          }
          // Jangan auto-reconnect.
          return
        }

        // badSession: credentials korup — reconnect dengan creds yang sama
        // pasti gagal terus. Wipe folder, minta user pair ulang (scan QR baru).
        // Pola wipe sama dengan kasus loggedOut di atas.
        if (reasonCode === DisconnectReason.badSession) {
          this.updateState(entry, {
            status: 'DISCONNECTED',
            qr: null,
            qrDataUrl: null,
            lastError: 'Sesi rusak (bad session) — perlu scan QR ulang',
          })
          this.emit<DisconnectedEvent>('disconnected', {
            sessionId,
            reason: 'bad session — perlu scan QR ulang',
          })
          await this.wipeFolder(sessionId).catch(() => {})
          return
        }

        // connectionReplaced / conflict (440): nomor ini diambil alih koneksi
        // lain (mis. instance wa-service ganda). Reconnect cuma saling tendang
        // tanpa henti — stop dengan status ERROR + alasan jelas.
        if (reasonCode === DisconnectReason.connectionReplaced) {
          this.updateState(entry, {
            status: 'ERROR',
            qr: null,
            qrDataUrl: null,
            lastError:
              'Koneksi digantikan sesi lain (conflict 440) — pastikan tidak ada instance wa-service ganda untuk nomor ini',
          })
          return
        }

        // restartRequired (515): normal pasca-pairing — reconnect cepat tanpa
        // dihitung sebagai kegagalan. Reason lain: exponential backoff +
        // jitter, stop setelah MAX_RECONNECT_ATTEMPTS percobaan beruntun.
        const isRestartRequired = reasonCode === DisconnectReason.restartRequired
        let delayMs = FAST_RECONNECT_DELAY_MS
        if (!isRestartRequired) {
          entry.reconnectAttempts += 1
          if (entry.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
            this.updateState(entry, {
              status: 'ERROR',
              qr: null,
              qrDataUrl: null,
              lastError: `Gagal reconnect setelah ${MAX_RECONNECT_ATTEMPTS} percobaan${reasonText ? ` — ${reasonText}` : ''}`,
            })
            return
          }
          delayMs = reconnectDelayMs(entry.reconnectAttempts)
          console.warn(
            `[wa-manager:${sessionId}] reconnect percobaan ke-${entry.reconnectAttempts} dalam ${delayMs}ms (reason: ${reasonCode ?? 'unknown'})`,
          )
        }

        // Reconnect otomatis untuk error lain (network, server down, dll.).
        this.updateState(entry, {
          status: 'CONNECTING',
          lastError: reasonText,
        })
        setTimeout(() => {
          if (!entry.intentionallyClosed) {
            this.connect(sessionId).catch((err) => {
              console.error(`[wa-manager:${sessionId}] reconnect gagal:`, err)
              this.updateState(entry, {
                status: 'ERROR',
                lastError: (err as Error).message,
              })
            })
          }
        }, delayMs)
      }
    })

    return entry.state
  }

  // ── Broadcast jobs ──────────────────────────────────────────────────────
  // Map<broadcastId, { cancelled }> — flag in-memory yang dicek setiap iterasi.
  private broadcastJobs = new Map<string, { cancelled: boolean }>()

  isBroadcastRunning(broadcastId: string): boolean {
    return this.broadcastJobs.has(broadcastId)
  }

  cancelBroadcast(broadcastId: string): boolean {
    const job = this.broadcastJobs.get(broadcastId)
    if (!job) return false
    job.cancelled = true
    return true
  }

  // Eksekusi broadcast: loop kirim pesan dengan delay random 2-5 detik.
  // Update progress ke Next.js setiap 5 pesan + saat selesai/gagal/cancelled.
  async runBroadcast(
    sessionId: string,
    broadcastId: string,
    items: { phoneNumber: string; content: string }[],
  ): Promise<void> {
    const job = { cancelled: false }
    this.broadcastJobs.set(broadcastId, job)

    let totalSent = 0
    let totalFailed = 0
    const REPORT_EVERY = 5

    try {
      for (let i = 0; i < items.length; i++) {
        if (job.cancelled) {
          await internalApi.reportBroadcastProgress(broadcastId, {
            totalSent,
            totalFailed,
            status: 'CANCELLED',
            completedAt: new Date().toISOString(),
          })
          return
        }

        const item = items[i]!
        const send = await this.sendText(sessionId, item.phoneNumber, item.content)
        if (send.ok) totalSent++
        else totalFailed++

        if ((i + 1) % REPORT_EVERY === 0 && i + 1 < items.length) {
          await internalApi.reportBroadcastProgress(broadcastId, {
            totalSent,
            totalFailed,
          })
        }

        // Jangan delay setelah pesan terakhir.
        if (i + 1 < items.length) {
          // Delay random 2-5 detik untuk hindari ban WhatsApp.
          const delay = 2000 + Math.floor(Math.random() * 3000)
          await sleep(delay)
        }
      }

      await internalApi.reportBroadcastProgress(broadcastId, {
        totalSent,
        totalFailed,
        status: 'COMPLETED',
        completedAt: new Date().toISOString(),
      })
    } catch (err) {
      console.error(`[wa-manager:${sessionId}] runBroadcast ${broadcastId} error:`, err)
      await internalApi.reportBroadcastProgress(broadcastId, {
        totalSent,
        totalFailed,
        status: 'FAILED',
        completedAt: new Date().toISOString(),
      })
    } finally {
      this.broadcastJobs.delete(broadcastId)
    }
  }

  // Kirim pesan teks ke nomor tertentu lewat session ini. Dipakai oleh
  // CS untuk reply manual via /api/inbox/[contactId]/send.
  //
  // Return messageId (Baileys msg.key.id) supaya caller bisa simpan ke DB
  // sebagai externalMsgId. Itu memungkinkan dedup saat event messages.upsert
  // fromMe masuk untuk pesan ini.
  async sendText(
    sessionId: string,
    phoneNumber: string,
    text: string,
  ): Promise<{ ok: boolean; error?: string; messageId?: string }> {
    const entry = this.sessions.get(sessionId)
    if (!entry || !entry.socket) {
      return { ok: false, error: 'session tidak aktif' }
    }
    if (entry.state.status !== 'CONNECTED') {
      return {
        ok: false,
        error: `session belum siap (status: ${entry.state.status})`,
      }
    }
    // Sanitasi nomor → JID valid. Kontak dari Live/order/LMS bisa tersimpan
    // ber-`+` (E.164) yang kalau dipakai mentah jadi JID invalid & pesan tak
    // pernah sampai. Kalau hasilnya null → gagalkan eksplisit, jangan pura-pura
    // terkirim (caller akan tampilkan FAILED, bukan SENT palsu di inbox).
    const jid = phoneToSendJid(phoneNumber)
    if (!jid) {
      return { ok: false, error: `nomor tujuan tidak valid: "${phoneNumber}"` }
    }
    try {
      const result = await entry.socket.sendMessage(jid, { text })
      const messageId = result?.key?.id ?? undefined
      if (messageId) this.markSent(entry, messageId)
      return { ok: true, messageId }
    } catch (err) {
      console.error(`[wa-manager:${sessionId}] sendText gagal:`, err)
      return { ok: false, error: (err as Error).message }
    }
  }

  // Tandai messageId sebagai pesan outgoing yang sudah kita kirim — supaya
  // event messages.upsert fromMe untuk ID ini di-skip (cegah duplikat /
  // misclassification sebagai WA_DIRECT). Auto-evict 60 detik kemudian.
  private markSent(entry: SessionEntry, messageId: string): void {
    entry.recentlySentIds.add(messageId)
    setTimeout(() => entry.recentlySentIds.delete(messageId), 60_000).unref()
  }

  // Tutup koneksi sosket. Kalau wipe=true → hapus credentials juga (logout permanen).
  async disconnect(sessionId: string, wipe = false): Promise<SessionState | null> {
    const entry = this.sessions.get(sessionId)
    if (!entry) return null
    entry.intentionallyClosed = true
    try {
      if (wipe) {
        await entry.socket?.logout().catch(() => {})
      } else {
        entry.socket?.end(undefined)
      }
    } catch (err) {
      console.error(`[wa-manager:${sessionId}] disconnect error:`, err)
    }

    if (wipe) {
      await this.wipeFolder(sessionId).catch(() => {})
      this.sessions.delete(sessionId)
      this.emit<DisconnectedEvent>('disconnected', { sessionId, reason: 'wiped' })
      return null
    }

    entry.socket = null
    this.updateState(entry, {
      status: 'DISCONNECTED',
      qr: null,
      qrDataUrl: null,
    })
    this.emit<DisconnectedEvent>('disconnected', { sessionId, reason: 'manual' })
    return entry.state
  }

  // ── pesan masuk → AI reply ───────────────────────────────────────────────

  private async handleIncomingMessage(
    entry: SessionEntry,
    msg: WAMessage,
  ): Promise<void> {
    // Filter umum: bukan group, bukan status, punya konten teks, bukan
    // pesan protokol. Berlaku untuk pesan customer maupun fromMe.
    if (!msg.message) return
    if (msg.message.protocolMessage || msg.message.reactionMessage) return
    const remoteJid = msg.key.remoteJid
    if (!remoteJid) return
    if (remoteJid === 'status@broadcast') return
    if (remoteJid.endsWith('@g.us')) return // skip grup untuk MVP

    const sessionId = entry.state.sessionId
    const content = extractText(msg)
    if (!content) {
      // Media tanpa caption (gambar/voice note/dokumen/stiker) dari customer:
      // jangan hilang diam-diam — simpan placeholder ke CRM supaya CS tetap
      // lihat di inbox. TIDAK memicu pipeline AI (tidak ada teks diproses).
      const placeholder = extractMediaPlaceholder(msg)
      if (placeholder && !msg.key.fromMe) {
        const mediaPhone = await resolvePhoneNumber(entry.socket, remoteJid)
        const savedMedia = await internalApi
          .saveMessage({
            sessionId,
            phoneNumber: mediaPhone,
            pushName: msg.pushName ?? null,
            content: placeholder,
            role: 'USER',
            withHistory: false,
          })
          .catch((err) => {
            console.error(
              `[wa-manager:${sessionId}] save placeholder media:`,
              err,
            )
            return null
          })
        // Emit hanya kalau save berhasil — supaya inbox tidak dapat pesan hantu.
        if (savedMedia?.success && savedMedia.data) {
          this.emitInboxMessage(sessionId, savedMedia.data.contactId, {
            phoneNumber: mediaPhone,
            name: msg.pushName ?? null,
            messageId: savedMedia.data.messageId,
            content: placeholder,
            role: 'USER',
            status: 'SENT',
            source: null,
          })
        }
      }
      return
    }

    // Resolve LID → PN. Helper sudah handle cache + fallback ke LID kalau
    // mapping belum ada.
    const phoneNumber = await resolvePhoneNumber(entry.socket, remoteJid)
    const externalMsgId = msg.key.id ?? null

    // ── Branch fromMe: pesan dari device/akun ini sendiri ──
    // Ini terjadi saat: (a) kita kirim via API web, (b) AI/flow kirim balasan,
    // (c) CS balas langsung dari WA HP. Hanya kasus (c) yang harus disimpan
    // sebagai pesan AGENT — sisanya sudah disimpan oleh code yang memicu kirim.
    if (msg.key.fromMe) {
      // Skip echo untuk pesan yang baru saja kita kirim sendiri (mempercepat
      // path tanpa hit DB) — handled by recentlySentIds + check-exists.
      if (externalMsgId && entry.recentlySentIds.has(externalMsgId)) return

      if (externalMsgId) {
        const existsRes = await internalApi.checkMessageExists({
          externalMsgId,
          sessionId,
        })
        if (existsRes.success && existsRes.data?.exists) return
      }

      // Pesan dari device sendiri yang BELUM tercatat. Cek apakah kontak
      // sedang ditakeover CS — kalau iya, ini balasan CS via WA HP.
      const statusRes = await internalApi.getContactStatus({
        sessionId,
        phoneNumber,
      })
      if (!statusRes.success || !statusRes.data) return
      if (!statusRes.data.aiPaused) return

      const savedDirect = await internalApi
        .saveMessage({
          sessionId,
          phoneNumber,
          pushName: msg.pushName ?? null,
          content,
          role: 'AGENT',
          source: 'WA_DIRECT',
          externalMsgId,
          withHistory: false,
        })
        .catch((err) => {
          console.error(`[wa-manager:${sessionId}] save WA_DIRECT msg:`, err)
          return null
        })
      // Balasan CS dari HP — emit ke inbox web supaya CS yang buka dashboard
      // melihat pesan yang dikirim lewat WA HP secara realtime.
      if (savedDirect?.success && savedDirect.data) {
        this.emitInboxMessage(sessionId, savedDirect.data.contactId, {
          phoneNumber,
          name: msg.pushName ?? null,
          messageId: savedDirect.data.messageId,
          content,
          role: 'AGENT',
          status: 'SENT',
          source: 'WA_DIRECT',
        })
      }
      return
    }

    // ── Branch !fromMe: pesan dari customer ──
    const inFlightKey = phoneNumber
    if (entry.inFlight.has(inFlightKey)) {
      // Pipeline AI kontak ini masih jalan. JANGAN drop pesan: antri konten
      // untuk putaran drain setelah pipeline selesai, dan tetap simpan ke CRM
      // sekarang supaya inbox lengkap. Putaran drain TIDAK menyimpan ulang
      // pesan ini (sudah tersimpan di sini).
      const queued = entry.pendingByContact.get(inFlightKey) ?? []
      entry.pendingByContact.set(inFlightKey, [...queued, content])
      const savedQueued = await internalApi
        .saveMessage({
          sessionId,
          phoneNumber,
          pushName: msg.pushName ?? null,
          content,
          role: 'USER',
          withHistory: false,
        })
        .catch((err) => {
          console.error(`[wa-manager:${sessionId}] save pesan antrian:`, err)
          return null
        })
      // Pesan customer beruntun — emit walau pipeline AI masih jalan, supaya
      // inbox web tetap menampilkan pesan masuk secara realtime.
      if (savedQueued?.success && savedQueued.data) {
        this.emitInboxMessage(sessionId, savedQueued.data.contactId, {
          phoneNumber,
          name: msg.pushName ?? null,
          messageId: savedQueued.data.messageId,
          content,
          role: 'USER',
          status: 'SENT',
          source: null,
        })
      }
      return
    }
    entry.inFlight.add(inFlightKey)

    let watchdog: ReturnType<typeof setTimeout> | undefined
    try {
      // Pipeline + drain dibungkus IIFE supaya bisa di-race dengan watchdog
      // timeout. inFlight tetap dipegang selama drain → mutual exclusion terjaga,
      // tidak mungkin double-reply / double-charge untuk kontak yang sama.
      const pipeline = (async () => {
        // Putaran pertama: pesan trigger — pipeline yang simpan ke CRM.
        let round = await this.runCustomerPipeline(entry, {
          remoteJid,
          phoneNumber,
          pushName: msg.pushName ?? null,
          content,
          presetHistory: null,
        })

        // Drain antrian pesan yang masuk selama pipeline jalan: gabungkan jadi
        // SATU konteks per putaran (join newline), max MAX_DRAIN_ROUNDS putaran
        // supaya tidak rekursi/loop tak terbatas.
        let drains = 0
        while (round.shouldContinue && drains < MAX_DRAIN_ROUNDS) {
          const pending = entry.pendingByContact.get(inFlightKey)
          if (!pending || pending.length === 0) break
          entry.pendingByContact.delete(inFlightKey)
          drains += 1
          round = await this.runCustomerPipeline(entry, {
            remoteJid,
            phoneNumber,
            pushName: msg.pushName ?? null,
            content: pending.join('\n'),
            presetHistory: round.historyAfter,
          })
        }
      })()

      // Watchdog: kalau pipeline hang > PIPELINE_TIMEOUT_MS, lepaskan lock supaya
      // kontak tidak terkunci permanen. Promise pipeline yang masih jalan
      // dibiarkan selesai sendiri (tak bisa di-cancel); reaction race tetap
      // melekat sehingga rejection telat tidak jadi unhandledRejection.
      const timeout = new Promise<never>((_, reject) => {
        watchdog = setTimeout(
          () => reject(new Error(`pipeline timeout ${PIPELINE_TIMEOUT_MS}ms`)),
          PIPELINE_TIMEOUT_MS,
        )
      })
      await Promise.race([pipeline, timeout])
    } catch (err) {
      console.error(
        `[wa-manager:${sessionId}] pipeline ${phoneNumber} gagal/timeout:`,
        err,
      )
    } finally {
      if (watchdog) clearTimeout(watchdog)
      // Sisa antrian (kalau ada) sudah tersimpan di CRM — buang dari memori
      // supaya tidak terbawa ke pipeline berikutnya, lalu lepas inFlight.
      entry.pendingByContact.delete(inFlightKey)
      entry.inFlight.delete(inFlightKey)
    }
  }

  // Satu putaran pipeline balasan untuk pesan customer.
  // - presetHistory == null → putaran normal: simpan pesan ke CRM
  //   (withHistory) lalu proses seperti biasa.
  // - presetHistory != null → putaran drain: pesan SUDAH disimpan saat
  //   enqueue, JANGAN simpan ulang; pakai history in-memory dari putaran
  //   sebelumnya sebagai konteks percakapan.
  // shouldContinue=false artinya putaran drain berikutnya tidak berguna
  // (CS takeover, STOP, token habis, config belum lengkap, atau error).
  private async runCustomerPipeline(
    entry: SessionEntry,
    args: {
      remoteJid: string
      phoneNumber: string
      pushName: string | null
      content: string
      presetHistory: InternalMessageHistoryItem[] | null
    },
  ): Promise<{
    shouldContinue: boolean
    historyAfter: InternalMessageHistoryItem[]
  }> {
    const sessionId = entry.state.sessionId
    const { remoteJid, phoneNumber, content } = args

    // JID tujuan kirim balasan: nomor PN hasil resolve (`<pn>@s.whatsapp.net`),
    // BUKAN remoteJid mentah yang bisa `<id>@lid`. Baileys 7 menerima
    // sendMessage(@lid) dan balik key TANPA error tapi TIDAK mengantar ke nomor
    // asli — sumber bug "balasan muncul di inbox web tapi tak sampai ke WA".
    // phoneToSendJid sama dengan jalur sendText/broadcast/followup yang terbukti
    // sampai. Untuk non-LID hasilnya identik (no-op). Fallback ke remoteJid kalau
    // PN tak ter-resolve (nihil di praktik; Baileys populate mapping saat decode).
    const sendJid = phoneToSendJid(phoneNumber) ?? remoteJid
    if (sendJid.endsWith('@lid')) {
      console.warn(
        `[wa-manager:${sessionId}] sendJid masih @lid (${sendJid}) — balasan rawan tidak terkirim`,
      )
    }

    let contactId: string
    let baseHistory: InternalMessageHistoryItem[]

    if (args.presetHistory === null) {
      // 1. Simpan pesan customer + minta history.
      const saved = await internalApi.saveMessage({
        sessionId,
        phoneNumber,
        pushName: args.pushName,
        content,
        role: 'USER',
        withHistory: true,
      })
      if (!saved.success || !saved.data) {
        console.error(
          `[wa-manager:${sessionId}] saveMessage gagal:`,
          saved.error,
        )
        return { shouldContinue: false, historyAfter: [] }
      }

      // Pesan customer tersimpan — emit ke inbox web realtime (sebelum cabang
      // aiPaused supaya CS yang takeover tetap lihat pesan masuk).
      this.emitInboxMessage(sessionId, saved.data.contactId, {
        phoneNumber,
        name: args.pushName,
        messageId: saved.data.messageId,
        content,
        role: 'USER',
        status: 'SENT',
        source: null,
      })

      // Kalau CS sedang ambil alih kontak ini → simpan saja, jangan AI reply.
      if (saved.data.contact?.aiPaused) {
        return { shouldContinue: false, historyAfter: saved.data.history }
      }
      contactId = saved.data.contactId
      // History dari server sudah termasuk pesan yang barusan disimpan.
      baseHistory = saved.data.history
    } else {
      // 1. (drain) Pesan sudah tersimpan saat enqueue — cukup re-check status
      // takeover. CS bisa saja ambil alih kontak di tengah putaran sebelumnya.
      const statusRes = await internalApi.getContactStatus({
        sessionId,
        phoneNumber,
      })
      if (!statusRes.success || !statusRes.data) {
        console.error(
          `[wa-manager:${sessionId}] getContactStatus (drain) gagal:`,
          statusRes.error,
        )
        return { shouldContinue: false, historyAfter: args.presetHistory }
      }
      if (statusRes.data.aiPaused) {
        return { shouldContinue: false, historyAfter: args.presetHistory }
      }
      contactId = statusRes.data.contactId
      // Konteks in-memory putaran sebelumnya + gabungan pesan antrian.
      baseHistory = [
        ...args.presetHistory,
        { role: 'USER', content, createdAt: new Date().toISOString() },
      ]
    }

    // History untuk putaran drain berikutnya = konteks sekarang + balasan
    // yang baru terkirim (immutable — selalu array baru).
    const withReply = (reply: string): InternalMessageHistoryItem[] => [
      ...baseHistory,
      { role: 'AI', content: reply, createdAt: new Date().toISOString() },
    ]

    // 1.4 Follow-Up STOP detection: kalau customer balas STOP/BERHENTI/dll,
    // Next.js akan blacklist customer + cancel pending queue. Return
    // autoReply opsional yang kita kirim balik via Baileys, lalu STOP semua
    // proses lain (jangan trigger flow / AI). Best-effort — kalau call
    // gagal, fallback diam ke flow normal.
    const stopCheck = await internalApi.checkFollowupStop({
      sessionId,
      phoneNumber,
      content,
    })
    if (stopCheck.success && stopCheck.data?.isStop) {
      if (stopCheck.data.autoReply) {
        // Kirim dipisah dari simpan: kalau sendMessage throw, saveMessage TETAP
        // jalan (status FAILED) supaya ada jejak di inbox CS, bukan hilang total.
        let msgId: string | null = null
        try {
          const sent = await entry.socket?.sendMessage(sendJid, {
            text: stopCheck.data.autoReply,
          })
          msgId = sent?.key?.id ?? null
          if (msgId) this.markSent(entry, msgId)
        } catch (err) {
          console.error(
            `[wa-manager:${sessionId}] followup stop autoReply gagal:`,
            err,
          )
        }
        const savedStop = await internalApi
          .saveMessage({
            sessionId,
            phoneNumber,
            content: stopCheck.data.autoReply,
            role: 'AI',
            source: 'AI',
            externalMsgId: msgId,
            tokensUsed: 0,
            // Tandai FAILED kalau Baileys tidak mengembalikan id (tak terkirim).
            status: msgId ? 'SENT' : 'FAILED',
          })
          .catch(() => null)
        // Emit balasan STOP otomatis ke inbox web (SENT/FAILED ikut hasil kirim).
        if (savedStop?.success && savedStop.data) {
          this.emitInboxMessage(sessionId, savedStop.data.contactId, {
            phoneNumber,
            name: args.pushName,
            messageId: savedStop.data.messageId,
            content: stopCheck.data.autoReply,
            role: 'AI',
            status: msgId ? 'SENT' : 'FAILED',
            source: 'AI',
          })
        }
      }
      // Customer minta STOP — jangan lanjut drain antrian.
      return { shouldContinue: false, historyAfter: baseHistory }
    }

    // 1.5 Sales Flow: kalau ada OrderSession aktif atau pesan ini cocok
    // trigger keyword, flow engine yang handle (script-based, hemat token).
    // Kalau gagal → diam-diam fallback ke AI normal.
    const flow = await internalApi.processFlow({
      sessionId,
      contactId,
      message: content,
    })
    if (flow.success && flow.data?.handled && flow.data.reply) {
      // Kirim balasan flow ke customer.
      let flowMsgId: string | null = null
      try {
        const sent = await entry.socket?.sendMessage(sendJid, {
          text: flow.data.reply,
        })
        flowMsgId = sent?.key?.id ?? null
        if (flowMsgId) this.markSent(entry, flowMsgId)
      } catch (err) {
        console.error(`[wa-manager:${sessionId}] flow sendMessage gagal:`, err)
      }
      // Simpan reply ke DB sebagai pesan AI (untuk inbox visibility).
      const savedFlow = await internalApi
        .saveMessage({
          sessionId,
          phoneNumber,
          content: flow.data.reply,
          role: 'AI',
          source: 'AI',
          externalMsgId: flowMsgId,
          tokensUsed: 0,
          status: flowMsgId ? 'SENT' : 'FAILED',
        })
        .catch((err) => {
          console.error(`[wa-manager:${sessionId}] flow save msg:`, err)
          return null
        })
      // Emit balasan flow ke inbox web (SENT/FAILED ikut hasil kirim Baileys).
      if (savedFlow?.success && savedFlow.data) {
        this.emitInboxMessage(sessionId, savedFlow.data.contactId, {
          phoneNumber,
          name: args.pushName,
          messageId: savedFlow.data.messageId,
          content: flow.data.reply,
          role: 'AI',
          status: flowMsgId ? 'SENT' : 'FAILED',
          source: 'AI',
        })
      }

      // Notifikasi admin kalau flow selesai dan setting-nya aktif.
      if (flow.data.notifyAdmin) {
        const { phoneNumber: adminPhone, message: adminMsg } =
          flow.data.notifyAdmin
        // sendText sudah handle JID + connection check. Best-effort: log
        // kalau gagal, jangan menahan flow customer-side.
        this.sendText(sessionId, adminPhone, adminMsg).catch((err) =>
          console.error(
            `[wa-manager:${sessionId}] notif admin gagal:`,
            err,
          ),
        )
      }
      // Kalau kirim gagal: jangan masukkan balasan ke history (biar AI tidak
      // mengira sudah menjawab) dan hentikan drain antrian.
      if (!flowMsgId) {
        return { shouldContinue: false, historyAfter: baseHistory }
      }
      // Flow bisa lanjut multi-step — antrian berikutnya boleh di-drain.
      return { shouldContinue: true, historyAfter: withReply(flow.data.reply) }
    }

    // 2. Ambil soul + model. Kalau belum di-set → skip reply.
    const cfg = await internalApi.getSoul(sessionId)
    if (!cfg.success || !cfg.data) {
      console.error(`[wa-manager:${sessionId}] getSoul gagal:`, cfg.error)
      return { shouldContinue: false, historyAfter: baseHistory }
    }
    const { soul, model, userId } = cfg.data
    if (!soul || !model) {
      // Belum dikonfigurasi user — biarkan, tidak balas.
      return { shouldContinue: false, historyAfter: baseHistory }
    }

    // 3. Pre-flight balance check — rough estimate dari avgTokensPerMessage.
    // Charge real dihitung server SETELAH AI sukses berdasarkan response.usage
    // (skema fair-pricing: proporsional terhadap penggunaan token).
    const preflightAmount = Math.max(
      model.costPerMessage,
      Math.ceil(model.avgTokensPerMessage / 50), // rough floor (1/50 of avg)
    )
    const enough = await tokenChecker.hasEnough(userId, preflightAmount)
    if (!enough) {
      this.updateState(entry, {
        status: 'PAUSED',
        lastError: 'Saldo token habis',
      })
      return { shouldContinue: false, historyAfter: baseHistory }
    }

    // 4. Ambil knowledge yang match keyword di pesan customer. Best-effort:
    // kalau gagal, lanjut tanpa knowledge — jangan menahan reply.
    const kb = await internalApi.getKnowledge(sessionId, content)
    const augmentedPrompt =
      kb.success && kb.data && kb.data.promptBlock
        ? soul.systemPrompt + kb.data.promptBlock
        : soul.systemPrompt

    // 5. Generate balasan — provider routing di ai-handler.
    const ai = await generateReply({
      systemPrompt: augmentedPrompt,
      provider: model.provider,
      modelId: model.modelId,
      history: baseHistory,
      latestUserMessage: content,
    })
    if (!ai.ok || !ai.reply) {
      console.error(`[wa-manager:${sessionId}] AI error:`, ai.error)
      if (ai.invalidApiKey) {
        this.updateState(entry, {
          status: 'PAUSED',
          lastError: ai.error ?? 'API key invalid',
        })
      }
      return { shouldContinue: false, historyAfter: baseHistory }
    }

    // 5. Charge token proporsional — server hitung tokensCharged dari real
    // (inputTokens, outputTokens) × harga AiModel × margin CS_REPLY config.
    // Kalau gagal → pause & jangan kirim balasan.
    // CATATAN: charge terjadi SEBELUM kirim. Kalau kirim gagal (status FAILED),
    // user tetap ter-charge untuk generasi AI yang sudah jalan (biaya provider
    // nyata). Setelah fix alamat JID, kegagalan kirim jadi edge case (jaringan
    // putus) — refund/retry otomatis belum diimplementasi (kandidat follow-up).
    const charge = await tokenChecker.chargeCsReply({
      userId,
      sessionId,
      aiModelId: model.id,
      inputTokens: ai.usage?.inputTokens ?? 0,
      outputTokens: ai.usage?.outputTokens ?? 0,
    })
    if (!charge.ok) {
      if (charge.insufficient) {
        this.updateState(entry, {
          status: 'PAUSED',
          lastError: 'Saldo token habis',
        })
      }
      return { shouldContinue: false, historyAfter: baseHistory }
    }

    // 6. Kirim balasan via Baileys ke JID yang benar (PN, bukan @lid).
    let aiMsgId: string | null = null
    let sendOk = false
    if (!entry.socket) {
      console.error(
        `[wa-manager:${sessionId}] sendMessage batal: socket null (kontak ${sendJid})`,
      )
    } else {
      try {
        const sent = await entry.socket.sendMessage(sendJid, { text: ai.reply })
        aiMsgId = sent?.key?.id ?? null
        sendOk = aiMsgId !== null
        if (aiMsgId) this.markSent(entry, aiMsgId)
        console.log(
          `[wa-manager:${sessionId}] AI reply → ${sendJid} ok=${sendOk} id=${aiMsgId ?? '-'}`,
        )
      } catch (err) {
        console.error(
          `[wa-manager:${sessionId}] sendMessage gagal → ${sendJid}:`,
          err,
        )
      }
    }

    // 6b. Kirim attachments dari knowledge IMAGE/FILE — HANYA kalau balasan
    // teks benar-benar terkirim (jangan kirim lampiran tanpa konteks). Fire-
    // and-forget, jangan block flow.
    const attachments = kb.success ? kb.data?.attachments ?? [] : []
    console.log(
      `[wa-manager:${sessionId}] reply done · sendOk=${sendOk} · attachments=${attachments.length}`,
    )
    if (sendOk && attachments.length > 0 && entry.socket) {
      void sendKnowledgeAttachments(
        entry.socket,
        sendJid,
        attachments,
        sessionId,
      )
    }

    // 7. Simpan balasan AI ke DB (history untuk percakapan berikutnya).
    const cost = buildCostFields(ai.usage, {
      tokensCharged: charge.tokensCharged ?? 0,
      apiCostRp: charge.apiCostRp ?? 0,
      revenueRp: charge.revenueRp ?? 0,
      profitRp: charge.profitRp ?? 0,
    })
    const savedAi = await internalApi
      .saveMessage({
        sessionId,
        phoneNumber,
        content: ai.reply,
        role: 'AI',
        source: 'AI',
        externalMsgId: aiMsgId,
        tokensUsed: cost.tokensCharged,
        // Kirim gagal → tandai FAILED supaya CS lihat "gagal terkirim" di inbox
        // dan bisa balas manual; bukan balasan palsu yang terlihat terkirim.
        status: sendOk ? 'SENT' : 'FAILED',
        ...cost,
      })
      .catch((err) => {
        console.error(`[wa-manager:${sessionId}] save AI msg:`, err)
        return null
      })
    // Emit balasan AI ke inbox web (SENT/FAILED ikut hasil kirim Baileys).
    if (savedAi?.success && savedAi.data) {
      this.emitInboxMessage(sessionId, savedAi.data.contactId, {
        phoneNumber,
        name: args.pushName,
        messageId: savedAi.data.messageId,
        content: ai.reply,
        role: 'AI',
        status: sendOk ? 'SENT' : 'FAILED',
        source: 'AI',
      })
    }

    // Kalau kirim gagal: JANGAN masukkan balasan ke history (AI jangan mengira
    // sudah menjawab — biar pesan berikutnya diproses fresh) & hentikan drain.
    if (!sendOk) {
      return { shouldContinue: false, historyAfter: baseHistory }
    }
    return { shouldContinue: true, historyAfter: withReply(ai.reply) }
  }

  // ── DEV/TEST: simulate incoming message tanpa Baileys ────────────────────
  // Trigger flow lengkap (saveMessage USER → cek soul/model → cek token →
  // generate AI → potong token → saveMessage AI) tanpa benar-benar menerima
  // dari WhatsApp. Kalau session ada di memory, status PAUSED akan ter-emit
  // saat saldo habis. Kalau tidak ada, flow tetap jalan tapi status update
  // di-skip.
  //
  // Return shape jelas untuk testing — caller dapat tau persis apa yang terjadi.
  async simulateIncomingMessage(input: {
    sessionId: string
    from: string // nomor WA customer (mis. "628111222333")
    message: string
  }): Promise<{
    outcome:
      | 'replied'
      | 'paused_no_token'
      | 'paused_invalid_apikey'
      | 'no_soul_or_model'
      | 'ai_paused_for_contact'
      | 'save_message_failed'
      | 'ai_error'
    reply?: string
    tokensCharged?: number
    error?: string
  }> {
    const { sessionId, from, message } = input
    const entry = this.sessions.get(sessionId) ?? null

    // 1. Save message customer + minta history.
    const saved = await internalApi.saveMessage({
      sessionId,
      phoneNumber: from,
      content: message,
      role: 'USER',
      withHistory: true,
    })
    if (!saved.success || !saved.data) {
      return { outcome: 'save_message_failed', error: saved.error }
    }
    if (saved.data.contact?.aiPaused) {
      return { outcome: 'ai_paused_for_contact' }
    }

    // 2. Soul + model.
    const cfg = await internalApi.getSoul(sessionId)
    if (!cfg.success || !cfg.data) {
      return { outcome: 'no_soul_or_model', error: cfg.error }
    }
    const { soul, model, userId } = cfg.data
    if (!soul || !model) {
      return { outcome: 'no_soul_or_model', error: 'Soul/model belum di-set' }
    }

    // 3. Cek saldo token (pre-flight rough estimate).
    const preflightAmount = Math.max(
      model.costPerMessage,
      Math.ceil(model.avgTokensPerMessage / 50),
    )
    const enough = await tokenChecker.hasEnough(userId, preflightAmount)
    if (!enough) {
      if (entry) {
        // Session ada di memory → updateState juga persist ke DB (lihat updateState).
        this.updateState(entry, {
          status: 'PAUSED',
          lastError: 'Saldo token habis',
        })
      } else {
        // Test scenario: session belum ter-restore di memory. Persist langsung
        // ke DB supaya UI tetap reflect status PAUSED.
        await internalApi
          .updateSessionStatus(sessionId, { status: 'PAUSED' })
          .catch((err) =>
            console.error(
              `[wa-manager:${sessionId}] persist PAUSED gagal:`,
              err,
            ),
          )
      }
      return { outcome: 'paused_no_token' }
    }

    // 4. Ambil knowledge yang match keyword (best-effort, sama seperti flow live).
    const kb = await internalApi.getKnowledge(sessionId, message)
    const augmentedPrompt =
      kb.success && kb.data && kb.data.promptBlock
        ? soul.systemPrompt + kb.data.promptBlock
        : soul.systemPrompt

    // 5. Generate AI reply.
    const ai = await generateReply({
      systemPrompt: augmentedPrompt,
      provider: model.provider,
      modelId: model.modelId,
      history: saved.data.history,
      latestUserMessage: message,
    })
    if (!ai.ok || !ai.reply) {
      if (ai.invalidApiKey) {
        if (entry) {
          this.updateState(entry, {
            status: 'PAUSED',
            lastError: ai.error ?? 'API key invalid',
          })
        }
        return { outcome: 'paused_invalid_apikey', error: ai.error }
      }
      return { outcome: 'ai_error', error: ai.error }
    }

    // 5. Charge token proporsional dari real usage AI.
    const charge = await tokenChecker.chargeCsReply({
      userId,
      sessionId,
      aiModelId: model.id,
      inputTokens: ai.usage?.inputTokens ?? 0,
      outputTokens: ai.usage?.outputTokens ?? 0,
    })
    if (!charge.ok) {
      if (charge.insufficient && entry) {
        this.updateState(entry, {
          status: 'PAUSED',
          lastError: 'Saldo token habis',
        })
      }
      return { outcome: 'paused_no_token', error: charge.error }
    }

    // 6. Skip Baileys send (test mode) — log saja kalau entry ada.
    if (entry?.socket) {
      console.log(
        `[wa-manager:${sessionId}] (TEST) skip sendMessage to ${from}: "${ai.reply.slice(0, 60)}..."`,
      )
    }

    // 7. Save reply AI ke DB.
    const cost = buildCostFields(ai.usage, {
      tokensCharged: charge.tokensCharged ?? 0,
      apiCostRp: charge.apiCostRp ?? 0,
      revenueRp: charge.revenueRp ?? 0,
      profitRp: charge.profitRp ?? 0,
    })
    await internalApi
      .saveMessage({
        sessionId,
        phoneNumber: from,
        content: ai.reply,
        role: 'AI',
        tokensUsed: cost.tokensCharged,
        ...cost,
      })
      .catch((err) =>
        console.error(`[wa-manager:${sessionId}] (TEST) save AI msg:`, err),
      )

    return {
      outcome: 'replied',
      reply: ai.reply,
      tokensCharged: cost.tokensCharged,
    }
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private makeInitialState(sessionId: string): SessionState {
    return {
      sessionId,
      status: 'DISCONNECTED',
      phoneNumber: null,
      displayName: null,
      qr: null,
      qrDataUrl: null,
      lastError: null,
      updatedAt: new Date().toISOString(),
    }
  }

  private updateState(entry: SessionEntry, patch: Partial<SessionState>): void {
    const prevStatus = entry.state.status
    const prevPhone = entry.state.phoneNumber
    const prevName = entry.state.displayName
    entry.state = {
      ...entry.state,
      ...patch,
      sessionId: entry.state.sessionId,
      updatedAt: new Date().toISOString(),
    }
    const event: StatusEvent = {
      sessionId: entry.state.sessionId,
      status: entry.state.status,
      phoneNumber: entry.state.phoneNumber,
      displayName: entry.state.displayName,
      reason: entry.state.lastError,
    }
    this.emit<StatusEvent>('status', event)

    // Persist ke DB (fire-and-forget) supaya status di UI dashboard / API
    // public selalu sync. Skip kalau tidak ada perubahan status / identitas
    // (hindari spam request untuk patch yang cuma update lastError).
    const statusChanged = entry.state.status !== prevStatus
    const phoneChanged =
      Boolean(entry.state.phoneNumber) && entry.state.phoneNumber !== prevPhone
    const nameChanged =
      Boolean(entry.state.displayName) && entry.state.displayName !== prevName
    if (statusChanged || phoneChanged || nameChanged) {
      internalApi
        .updateSessionStatus(entry.state.sessionId, {
          status: entry.state.status,
          phoneNumber: entry.state.phoneNumber,
          displayName: entry.state.displayName,
        })
        .catch((err) =>
          console.error(
            `[wa-manager:${entry.state.sessionId}] persist status gagal:`,
            err,
          ),
        )
    }
  }

  private emit<T>(
    event:
      | 'qr'
      | 'status'
      | 'connected'
      | 'disconnected'
      | 'inbox:message'
      | 'inbox:status',
    payload: T,
  ) {
    // Broadcast ke room sessionId — frontend join room saat membuka modal/halaman.
    const sessionId = (payload as unknown as { sessionId: string }).sessionId
    this.io.to(`session:${sessionId}`).emit(event, payload)
  }

  // Emit event 'inbox:message' ke room sesi setiap pesan baru tersimpan ke CRM.
  // Dipanggil SETELAH saveMessage berhasil — supaya inbox web realtime tanpa
  // polling. messageId boleh null kalau titik save tidak mengembalikannya.
  private emitInboxMessage(
    sessionId: string,
    contactId: string,
    opts: {
      phoneNumber: string
      name: string | null
      messageId: string | null
      content: string
      role: 'USER' | 'AI' | 'AGENT' | 'HUMAN'
      status: 'SENT' | 'FAILED'
      source: string | null
    },
  ): void {
    this.emit<InboxMessageEvent>('inbox:message', {
      sessionId,
      contactId,
      phoneNumber: opts.phoneNumber,
      name: opts.name,
      message: {
        id: opts.messageId,
        content: opts.content,
        role: opts.role,
        status: opts.status,
        source: opts.source,
        createdAt: new Date().toISOString(),
      },
    })
  }

  private async wipeFolder(sessionId: string): Promise<void> {
    const folder = path.join(this.sessionsDir, sessionId)
    await fs.rm(folder, { recursive: true, force: true })
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Resolve fileUrl jadi URL absolut yang bisa di-fetch Baileys. Knowledge file
// disimpan sebagai path relative `/uploads/...` di Next.js; eksternal URL
// (http/https) dilewatkan apa adanya.
//
// PENTING: untuk path `/uploads/*` kita pakai UPLOADS_URL (nginx container
// `hulao-uploads`) — BUKAN NEXTJS_URL. Next.js standalone mode punya bug:
// file di /public yang di-tambah runtime (semua knowledge upload pasti
// runtime) return 404. nginx serve langsung dari filesystem.
// Lihat docker-compose.yml line 99-103 untuk konteks.
function resolveAttachmentUrl(fileUrl: string): string {
  if (!fileUrl) return fileUrl
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl
  const normalized = fileUrl.startsWith('/') ? fileUrl : '/' + fileUrl
  const isUpload = normalized.startsWith('/uploads/')
  const base = isUpload
    ? process.env.UPLOADS_URL || 'http://hulao-uploads'
    : process.env.NEXTJS_URL || 'http://localhost:3000'
  return base.replace(/\/$/, '') + normalized
}

// Kirim list attachment knowledge ke customer setelah balasan teks AI.
// Best-effort: kalau satu gagal, lanjut yang berikutnya. Tunda 600ms antar
// kirim supaya WA tidak rate-limit & terkesan natural (bukan spam).
async function sendKnowledgeAttachments(
  socket: WASocket,
  jid: string,
  attachments: Array<{
    fileUrl: string
    title: string
    caption: string | null
    contentType: string
  }>,
  sessionId: string,
): Promise<void> {
  // Cap supaya tidak spam: max 3 attachment per balasan.
  const list = attachments.slice(0, 3)
  for (let i = 0; i < list.length; i++) {
    const att = list[i]
    if (!att?.fileUrl) continue
    // Jeda kecil antar attachment & sebelum attachment pertama (kasih jeda
    // dari teks AI yang baru terkirim).
    await sleep(i === 0 ? 800 : 600)
    try {
      const url = resolveAttachmentUrl(att.fileUrl)
      const caption = att.caption?.trim() || undefined
      console.log(
        `[wa-manager:${sessionId}] sending attachment "${att.title}" type=${att.contentType} url=${url}`,
      )
      if (att.contentType === 'IMAGE') {
        await socket.sendMessage(jid, {
          image: { url },
          caption,
        })
      } else {
        // FILE generic — kirim sebagai document.
        // Tebak filename + mimetype dari extension URL.
        const fname =
          decodeURIComponent(url.split('/').pop() || 'file.bin').slice(0, 120) ||
          att.title.slice(0, 60) ||
          'attachment'
        const ext = (fname.split('.').pop() || '').toLowerCase()
        const mimeMap: Record<string, string> = {
          pdf: 'application/pdf',
          doc: 'application/msword',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          xls: 'application/vnd.ms-excel',
          xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          ppt: 'application/vnd.ms-powerpoint',
          pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          txt: 'text/plain',
          csv: 'text/csv',
          zip: 'application/zip',
          mp3: 'audio/mpeg',
          mp4: 'video/mp4',
        }
        const mimetype = mimeMap[ext] || 'application/octet-stream'
        await socket.sendMessage(jid, {
          document: { url },
          fileName: fname,
          mimetype,
          caption,
        })
      }
    } catch (err) {
      console.error(
        `[wa-manager:${sessionId}] sendKnowledgeAttachments "${att.title}" gagal:`,
        err,
      )
    }
  }
}

// Ambil teks dari pesan WA. Beberapa varian:
// - conversation: pesan teks biasa
// - extendedTextMessage.text: pesan teks dengan reply/preview link
// - imageMessage.caption / videoMessage.caption: caption media
// - buttonsResponseMessage.selectedDisplayText / listResponseMessage.title: balasan tombol
function extractText(msg: WAMessage): string | null {
  const m = msg.message
  if (!m) return null
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    null
  )
}

// Placeholder untuk pesan media TANPA caption (extractText return null) —
// supaya tetap tercatat di inbox CRM walau tidak ada teks untuk diproses AI.
// Urutan cek mengikuti varian message Baileys yang dipakai extractText.
function extractMediaPlaceholder(msg: WAMessage): string | null {
  const m = msg.message
  if (!m) return null
  if (m.imageMessage) return '[Gambar]'
  if (m.videoMessage) return '[Video]'
  // ptt (push-to-talk) = voice note; selain itu file audio biasa.
  if (m.audioMessage) return m.audioMessage.ptt ? '[Voice note]' : '[Audio]'
  if (m.documentMessage) return '[Dokumen]'
  if (m.stickerMessage) return '[Stiker]'
  return null
}
