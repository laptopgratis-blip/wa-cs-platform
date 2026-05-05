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
import qrcode from 'qrcode'
import type { Server as IOServer } from 'socket.io'

import { generateReply, type AiUsage } from './ai-handler.js'
import { internalApi, type InternalSoulConfig } from './internal-api.js'
import { tokenChecker } from './token-checker.js'

// Hitung field cost untuk pesan AI dari usage provider + harga model +
// snapshot pricing settings. Output langsung dipakai sebagai body
// saveMessage. Kalau usage hilang (mis. provider tidak mengembalikan),
// field tetap dikirim sebagai 0 supaya dashboard punya data yang konsisten.
function buildCostFields(
  model: NonNullable<InternalSoulConfig['model']>,
  pricing: InternalSoulConfig['pricing'],
  usage: AiUsage | undefined,
): {
  apiInputTokens: number
  apiOutputTokens: number
  apiCostRp: number
  tokensCharged: number
  revenueRp: number
  profitRp: number
} {
  const inputTokens = usage?.inputTokens ?? 0
  const outputTokens = usage?.outputTokens ?? 0
  const apiCostUsd =
    (inputTokens * model.inputPricePer1M +
      outputTokens * model.outputPricePer1M) /
    1_000_000
  const apiCostRp = apiCostUsd * pricing.usdRate
  const tokensCharged = model.costPerMessage
  const revenueRp = tokensCharged * pricing.pricePerToken
  return {
    apiInputTokens: inputTokens,
    apiOutputTokens: outputTokens,
    apiCostRp,
    tokensCharged,
    revenueRp,
    profitRp: revenueRp - apiCostRp,
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

  // Mulai (atau lanjutkan) satu sesi. Idempoten — kalau sudah jalan, return state saat ini.
  async connect(sessionId: string): Promise<SessionState> {
    const existing = this.sessions.get(sessionId)
    if (existing && existing.socket) {
      return existing.state
    }

    const folder = path.join(this.sessionsDir, sessionId)
    await fs.mkdir(folder, { recursive: true })

    const { state: authState, saveCreds } = await useMultiFileAuthState(folder)
    // fetchLatestBaileysVersion bisa gagal kalau tidak ada internet — Baileys
    // akan pakai fallback bawaan kalau `version` undefined.
    const version = await fetchLatestBaileysVersion()
      .then((r) => r.version)
      .catch(() => undefined)

    const entry: SessionEntry = existing ?? {
      state: this.makeInitialState(sessionId),
      socket: null,
      intentionallyClosed: false,
      inFlight: new Set<string>(),
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
    })
    entry.socket = sock

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('messages.upsert', (event) => {
      // Hanya pesan baru (bukan history sync). Process async, jangan block.
      console.log("[DEBUG] messages.upsert type:", event.type, "count:", event.messages.length); if (event.type !== 'notify') return
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
  async sendText(
    sessionId: string,
    phoneNumber: string,
    text: string,
  ): Promise<{ ok: boolean; error?: string }> {
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
      await entry.socket.sendMessage(jid, { text })
      return { ok: true }
    } catch (err) {
      console.error(`[wa-manager:${sessionId}] sendText gagal:`, err)
      return { ok: false, error: (err as Error).message }
    }
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
    // Filter: hanya pesan dari customer (bukan kita), bukan group, bukan status,
    // dan punya konten teks. Skip pesan protokol (delete, edit, dst.).
    if (!msg.message) return
    if (msg.key.fromMe) return
    const remoteJid = msg.key.remoteJid
    if (!remoteJid) return
    if (remoteJid === 'status@broadcast') return
    if (remoteJid.endsWith('@g.us')) return // skip grup untuk MVP
    if (msg.message.protocolMessage || msg.message.reactionMessage) return

    const content = extractText(msg)
    if (!content) return // bukan pesan teks (media/sticker/dll.)

    const phoneNumber = remoteJid.includes("@lid") ? remoteJid : remoteJid.split("@")[0] ?? remoteJid
    const inFlightKey = phoneNumber
    if (entry.inFlight.has(inFlightKey)) {
      // Pesan beruntun dari kontak yang sama — biarkan flow yang sedang
      // jalan menyimpan history-nya, request berikut akan ambil pas turn-nya.
      return
    }
    entry.inFlight.add(inFlightKey)

    const sessionId = entry.state.sessionId
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

      // 2. Ambil soul + model. Kalau belum di-set → skip reply.
      const cfg = await internalApi.getSoul(sessionId)
      if (!cfg.success || !cfg.data) {
        console.error(`[wa-manager:${sessionId}] getSoul gagal:`, cfg.error)
        return
      }
      const { soul, model, userId, pricing } = cfg.data
      if (!soul || !model) {
        // Belum dikonfigurasi user — biarkan, tidak balas.
        return
      }

      // 3. Cek saldo token sebelum panggil AI.
      const enough = await tokenChecker.hasEnough(userId, model.costPerMessage)
      if (!enough) {
        this.updateState(entry, {
          status: 'PAUSED',
          lastError: 'Saldo token habis',
        })
        return
      }

      // 4. Generate balasan — provider routing di ai-handler.
      const ai = await generateReply({
        systemPrompt: soul.systemPrompt,
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

      // 5. Potong token (atomic). Kalau gagal → pause & jangan kirim balasan.
      const charge = await tokenChecker.charge({
        userId,
        amount: model.costPerMessage,
        description: `Reply via ${model.modelId}`,
        reference: sessionId,
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
      try {
        await entry.socket?.sendMessage(remoteJid, { text: ai.reply })
      } catch (err) {
        console.error(`[wa-manager:${sessionId}] sendMessage gagal:`, err)
      }

      // 7. Simpan balasan AI ke DB (history untuk percakapan berikutnya).
      const cost = buildCostFields(model, pricing, ai.usage)
      await internalApi
        .saveMessage({
          sessionId,
          phoneNumber,
          content: ai.reply,
          role: 'AI',
          tokensUsed: model.costPerMessage,
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
    const { soul, model, userId, pricing } = cfg.data
    if (!soul || !model) {
      return { outcome: 'no_soul_or_model', error: 'Soul/model belum di-set' }
    }

    // 3. Cek saldo token.
    const enough = await tokenChecker.hasEnough(userId, model.costPerMessage)
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

    // 4. Generate AI reply.
    const ai = await generateReply({
      systemPrompt: soul.systemPrompt,
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

    // 5. Potong token (atomic).
    const charge = await tokenChecker.charge({
      userId,
      amount: model.costPerMessage,
      description: `Reply via ${model.modelId} (test)`,
      reference: sessionId,
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
    const cost = buildCostFields(model, pricing, ai.usage)
    await internalApi
      .saveMessage({
        sessionId,
        phoneNumber: from,
        content: ai.reply,
        role: 'AI',
        tokensUsed: model.costPerMessage,
        ...cost,
      })
      .catch((err) =>
        console.error(`[wa-manager:${sessionId}] (TEST) save AI msg:`, err),
      )

    return {
      outcome: 'replied',
      reply: ai.reply,
      tokensCharged: model.costPerMessage,
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
