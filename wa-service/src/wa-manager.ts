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
  useMultiFileAuthState,
  type WAMessage,
  type WASocket,
} from 'baileys'
import fs from 'node:fs/promises'
import path from 'node:path'
import P from 'pino'
import qrcode from 'qrcode'
import type { Server as IOServer } from 'socket.io'

import { generateReply, type AiUsage } from './ai-handler.js'
import { internalApi, type InternalSoulConfig } from './internal-api.js'
import { resolvePhoneNumber } from './lib/jid-resolver.js'
import { tokenChecker } from './token-checker.js'

// Cache version Baileys di module-level. fetchLatestBaileysVersion() HTTP
// ke GitHub setiap call — bisa 1-5s lat. Cache 1 jam, refresh background.
// Kalau call pertama belum selesai, semua connect await Promise yang sama.
const BAILEYS_VERSION_TTL_MS = 60 * 60 * 1000
let cachedVersion: { value: number[] | undefined; fetchedAt: number } | null = null
let inflightVersionFetch: Promise<number[] | undefined> | null = null

async function getBaileysVersionCached(): Promise<number[] | undefined> {
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

interface SessionEntry {
  state: SessionState
  socket: WASocket | null
  // Kalau true: jangan auto-reconnect saat connection.update close (user minta disconnect).
  intentionallyClosed: boolean
  // Set kontak yang sedang diproses AI (kunci: phoneNumber). Hindari double-reply
  // kalau customer kirim banyak pesan beruntun.
  inFlight: Set<string>
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
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      try {
        await this.connect(entry.name)
        restored.push(entry.name)
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

  // Mulai (atau lanjutkan) satu sesi. Idempoten — kalau sudah jalan, return state saat ini.
  async connect(sessionId: string): Promise<SessionState> {
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
        }, 1500)
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
    const jid = phoneNumber.includes('@')
      ? phoneNumber
      : `${phoneNumber}@s.whatsapp.net`
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

    const content = extractText(msg)
    if (!content) return // bukan pesan teks (media/sticker/dll.)

    const sessionId = entry.state.sessionId
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

      await internalApi
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
        .catch((err) =>
          console.error(`[wa-manager:${sessionId}] save WA_DIRECT msg:`, err),
        )
      return
    }

    // ── Branch !fromMe: pesan dari customer ──
    const inFlightKey = phoneNumber
    if (entry.inFlight.has(inFlightKey)) {
      // Pesan beruntun dari kontak yang sama — biarkan flow yang sedang
      // jalan menyimpan history-nya, request berikut akan ambil pas turn-nya.
      return
    }
    entry.inFlight.add(inFlightKey)

    try {
      // 1. Simpan pesan customer + minta history.
      const saved = await internalApi.saveMessage({
        sessionId,
        phoneNumber,
        pushName: msg.pushName ?? null,
        content,
        role: 'USER',
        withHistory: true,
      })
      if (!saved.success || !saved.data) {
        console.error(
          `[wa-manager:${sessionId}] saveMessage gagal:`,
          saved.error,
        )
        return
      }

      // Kalau CS sedang ambil alih kontak ini → simpan saja, jangan AI reply.
      if (saved.data.contact?.aiPaused) return

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
          try {
            const sent = await entry.socket?.sendMessage(remoteJid, {
              text: stopCheck.data.autoReply,
            })
            const msgId = sent?.key?.id ?? null
            if (msgId) this.markSent(entry, msgId)
            await internalApi
              .saveMessage({
                sessionId,
                phoneNumber,
                content: stopCheck.data.autoReply,
                role: 'AI',
                source: 'AI',
                externalMsgId: msgId,
                tokensUsed: 0,
              })
              .catch(() => {})
          } catch (err) {
            console.error(
              `[wa-manager:${sessionId}] followup stop autoReply gagal:`,
              err,
            )
          }
        }
        return
      }

      // 1.5 Sales Flow: kalau ada OrderSession aktif atau pesan ini cocok
      // trigger keyword, flow engine yang handle (script-based, hemat token).
      // Kalau gagal → diam-diam fallback ke AI normal.
      const flow = await internalApi.processFlow({
        sessionId,
        contactId: saved.data.contactId,
        message: content,
      })
      if (flow.success && flow.data?.handled && flow.data.reply) {
        // Kirim balasan flow ke customer.
        let flowMsgId: string | null = null
        try {
          const sent = await entry.socket?.sendMessage(remoteJid, {
            text: flow.data.reply,
          })
          flowMsgId = sent?.key?.id ?? null
          if (flowMsgId) this.markSent(entry, flowMsgId)
        } catch (err) {
          console.error(`[wa-manager:${sessionId}] flow sendMessage gagal:`, err)
        }
        // Simpan reply ke DB sebagai pesan AI (untuk inbox visibility).
        await internalApi
          .saveMessage({
            sessionId,
            phoneNumber,
            content: flow.data.reply,
            role: 'AI',
            source: 'AI',
            externalMsgId: flowMsgId,
            tokensUsed: 0,
          })
          .catch((err) =>
            console.error(`[wa-manager:${sessionId}] flow save msg:`, err),
          )

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
        return
      }

      // 2. Ambil soul + model. Kalau belum di-set → skip reply.
      const cfg = await internalApi.getSoul(sessionId)
      if (!cfg.success || !cfg.data) {
        console.error(`[wa-manager:${sessionId}] getSoul gagal:`, cfg.error)
        return
      }
      const { soul, model, userId } = cfg.data
      if (!soul || !model) {
        // Belum dikonfigurasi user — biarkan, tidak balas.
        return
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
        return
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
        history: saved.data.history,
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
        return
      }

      // 5. Charge token proporsional — server hitung tokensCharged dari real
      // (inputTokens, outputTokens) × harga AiModel × margin CS_REPLY config.
      // Kalau gagal → pause & jangan kirim balasan.
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
        return
      }

      // 6. Kirim balasan via Baileys.
      let aiMsgId: string | null = null
      try {
        const sent = await entry.socket?.sendMessage(remoteJid, {
          text: ai.reply,
        })
        aiMsgId = sent?.key?.id ?? null
        if (aiMsgId) this.markSent(entry, aiMsgId)
      } catch (err) {
        console.error(`[wa-manager:${sessionId}] sendMessage gagal:`, err)
      }

      // 6b. Kirim attachments dari knowledge IMAGE/FILE — fire-and-forget,
      // jangan block flow. wa-manager auto-attach supaya AI tidak perlu
      // request manual ke admin ("admin akan kirim foto/bukti").
      const attachments = kb.success ? kb.data?.attachments ?? [] : []
      console.log(
        `[wa-manager:${sessionId}] reply done · attachments=${attachments.length}`,
      )
      if (attachments.length > 0 && entry.socket) {
        void sendKnowledgeAttachments(
          entry.socket,
          remoteJid,
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
      await internalApi
        .saveMessage({
          sessionId,
          phoneNumber,
          content: ai.reply,
          role: 'AI',
          source: 'AI',
          externalMsgId: aiMsgId,
          tokensUsed: cost.tokensCharged,
          ...cost,
        })
        .catch((err) =>
          console.error(`[wa-manager:${sessionId}] save AI msg:`, err),
        )
    } finally {
      entry.inFlight.delete(inFlightKey)
    }
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

  private emit<T>(event: 'qr' | 'status' | 'connected' | 'disconnected', payload: T) {
    // Broadcast ke room sessionId — frontend join room saat membuka modal/halaman.
    const sessionId = (payload as unknown as { sessionId: string }).sessionId
    this.io.to(`session:${sessionId}`).emit(event, payload)
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
function resolveAttachmentUrl(fileUrl: string): string {
  if (!fileUrl) return fileUrl
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl
  const base = process.env.NEXTJS_URL || 'http://localhost:3000'
  // Pastikan tidak double-slash.
  return base.replace(/\/$/, '') + (fileUrl.startsWith('/') ? fileUrl : '/' + fileUrl)
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
