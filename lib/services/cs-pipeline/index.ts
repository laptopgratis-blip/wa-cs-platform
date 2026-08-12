// Orkestrator pipeline balasan CS — replika urutan wa-service/src/
// wa-manager.ts runCustomerPipeline (save → takeover → STOP → flow → soul →
// token → knowledge → AI → charge → kirim → simpan), tapi provider-agnostic:
// transport kirim di-inject lewat callback `send`, jadi bisa dipakai webhook
// Cloud API sekarang dan (nanti) transport lain.
//
// wa-service Baileys TIDAK memakai file ini — dia tetap mengorkestrasi
// sendiri via endpoint /api/internal/* yang kini menjadi wrapper tipis di
// atas lib yang sama.

import { prisma } from '@/lib/prisma'
import { generateCsReply } from '@/lib/services/cs-reply-ai'
import {
  applyFollowupStop,
  detectStopKeyword,
  STOP_AUTO_REPLY,
} from '@/lib/services/followup-stop'
import { processFlowMessage } from '@/lib/services/flow-engine'

import { chargeCsReply, hasEnoughTokens } from './charge'
import { getKnowledgeForMessage } from './knowledge'
import {
  saveMessage,
  type SavedMessageHistoryItem,
} from './message-store'
import { getSessionAiConfig } from './session-config'

export interface CsSendResult {
  ok: boolean
  externalMsgId: string | null
  error?: string
}

export interface CsSavedNotification {
  contactId: string
  messageId: string
  phoneNumber: string
  name?: string | null
  content: string
  role: 'USER' | 'AI'
  status: 'SENT' | 'FAILED'
  source: string | null
}

export interface RunCsPipelineInput {
  sessionId: string
  /** Nomor customer, digit murni (wa_id Meta / normalized Baileys). */
  phoneNumber: string
  pushName?: string | null
  content: string
  /** ID eksternal pesan masuk (wamid) — disimpan untuk dedup. */
  inboundExternalId?: string | null
  /** Kirim teks ke customer via transport sesi ini. Tidak boleh throw. */
  send: (text: string) => Promise<CsSendResult>
  /** Kirim teks ke nomor lain (notif admin flow). Opsional, tidak boleh throw. */
  sendToPhone?: (phoneNumber: string, text: string) => Promise<CsSendResult>
  /** Dipanggil tiap pesan tersimpan — jembatan realtime inbox. */
  onSaved?: (info: CsSavedNotification) => void
  /** Sesi CLOUD_API: pesan masuk membuka window 24 jam. */
  touchWindow?: boolean
  /**
   * Putaran drain: pesan sudah tersimpan saat di-antri — jangan simpan ulang,
   * muat kontak + history segar dari DB.
   */
  skipSave?: boolean
}

export type CsPipelineOutcome =
  | 'replied'
  | 'flow_replied'
  | 'stop_acknowledged'
  | 'ai_paused_for_contact'
  | 'no_soul_or_model'
  | 'paused_no_token'
  | 'paused_invalid_apikey'
  | 'send_failed'
  | 'ai_error'
  | 'session_not_found'
  | 'save_message_failed'

export interface CsPipelineResult {
  outcome: CsPipelineOutcome
  detail?: string
  /** false = drain antrian harus berhenti (paritas shouldContinue wa-manager). */
  shouldContinue: boolean
}

async function pauseSession(sessionId: string, reason: string): Promise<void> {
  await prisma.whatsappSession
    .update({ where: { id: sessionId }, data: { status: 'PAUSED', lastError: reason } })
    .catch((err) => console.error('[cs-pipeline] gagal pause sesi:', err))
}

export async function runCsPipeline(
  input: RunCsPipelineInput,
): Promise<CsPipelineResult> {
  const stop = (outcome: CsPipelineOutcome, detail?: string): CsPipelineResult => ({
    outcome,
    detail,
    shouldContinue: false,
  })

  const session = await prisma.whatsappSession.findUnique({
    where: { id: input.sessionId },
    select: { id: true, userId: true },
  })
  if (!session) return stop('session_not_found')
  const { userId } = session

  // 1. Simpan pesan customer + ambil history (atau muat ulang saat drain).
  let contactId: string
  let aiPaused: boolean
  let history: SavedMessageHistoryItem[]

  if (input.skipSave) {
    const contact = await prisma.contact.findFirst({
      where: { userId, phoneNumber: input.phoneNumber },
      select: { id: true, aiPaused: true },
    })
    if (!contact) return stop('save_message_failed', 'kontak drain tidak ditemukan')
    contactId = contact.id
    aiPaused = contact.aiPaused
    const recent = await prisma.message.findMany({
      where: { contactId, status: { not: 'FAILED' } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { role: true, content: true, createdAt: true },
    })
    history = recent.reverse()
  } else {
    let saved
    try {
      saved = await saveMessage({
        sessionId: input.sessionId,
        phoneNumber: input.phoneNumber,
        pushName: input.pushName,
        content: input.content,
        role: 'USER',
        withHistory: true,
        externalMsgId: input.inboundExternalId,
        touchWindow: input.touchWindow,
      })
    } catch (err) {
      console.error('[cs-pipeline] saveMessage USER gagal:', err)
      return stop('save_message_failed', (err as Error).message)
    }
    if (!saved) return stop('session_not_found')
    contactId = saved.contactId
    aiPaused = saved.contact.aiPaused
    history = saved.history
    input.onSaved?.({
      contactId,
      messageId: saved.messageId,
      phoneNumber: input.phoneNumber,
      name: input.pushName,
      content: input.content,
      role: 'USER',
      status: 'SENT',
      source: null,
    })
  }

  // 2. Human takeover: CS pegang kendali — AI diam.
  if (aiPaused) return stop('ai_paused_for_contact')

  // Helper: kirim balasan otomatis + simpan + notifikasi (STOP / flow / AI).
  const sendAndSaveReply = async (
    text: string,
    costFields?: {
      tokensUsed: number
      apiInputTokens: number
      apiOutputTokens: number
      apiCostRp: number
      tokensCharged: number
      revenueRp: number
      profitRp: number
    },
  ): Promise<{ sendOk: boolean }> => {
    const sent = await input.send(text)
    const sendOk = sent.ok && sent.externalMsgId !== null
    const savedReply = await saveMessage({
      sessionId: input.sessionId,
      phoneNumber: input.phoneNumber,
      content: text,
      role: 'AI',
      source: 'AI',
      externalMsgId: sent.externalMsgId,
      tokensUsed: costFields?.tokensCharged ?? 0,
      status: sendOk ? 'SENT' : 'FAILED',
      ...(costFields ?? {}),
    }).catch((err) => {
      console.error('[cs-pipeline] save balasan gagal:', err)
      return null
    })
    if (savedReply) {
      input.onSaved?.({
        contactId: savedReply.contactId,
        messageId: savedReply.messageId,
        phoneNumber: input.phoneNumber,
        name: input.pushName,
        content: text,
        role: 'AI',
        status: sendOk ? 'SENT' : 'FAILED',
        source: 'AI',
      })
    }
    return { sendOk }
  }

  // 3. Follow-up STOP: blacklist + auto-reply, hentikan proses lain.
  const stopMatched = detectStopKeyword(input.content)
  if (stopMatched) {
    await applyFollowupStop({
      userId,
      phoneNumber: input.phoneNumber,
      content: input.content,
      matched: stopMatched,
    })
    await sendAndSaveReply(STOP_AUTO_REPLY)
    return stop('stop_acknowledged')
  }

  // 4. Sales Flow engine (script-based, hemat token). Fail-open: error flow
  // tidak boleh memutus chat — lanjut ke AI normal.
  try {
    const flow = await processFlowMessage({
      userId,
      contactId,
      message: input.content,
    })
    if (flow.handled && flow.reply) {
      const { sendOk } = await sendAndSaveReply(flow.reply)
      if (flow.notifyAdmin && input.sendToPhone) {
        // Best-effort — jangan menahan balasan customer.
        void input
          .sendToPhone(flow.notifyAdmin.phoneNumber, flow.notifyAdmin.message)
          .catch(() => undefined)
      }
      return { outcome: 'flow_replied', shouldContinue: sendOk }
    }
  } catch (err) {
    console.error('[cs-pipeline] flow engine error (fail-open):', err)
  }

  // 5. Soul + model — belum dikonfigurasi → diam (tidak balas).
  const cfg = await getSessionAiConfig(input.sessionId)
  if (!cfg) return stop('session_not_found')
  if (!cfg.soul?.systemPrompt || !cfg.model) return stop('no_soul_or_model')

  // 6. Pre-flight saldo (estimasi kasar) — charge real setelah AI sukses.
  const preflightAmount = Math.max(
    cfg.model.costPerMessage,
    Math.ceil(cfg.model.avgTokensPerMessage / 50),
  )
  if (!(await hasEnoughTokens(userId, preflightAmount))) {
    await pauseSession(input.sessionId, 'Saldo token habis')
    return stop('paused_no_token')
  }

  // 7. Knowledge augmentation — best-effort.
  let promptBlock = ''
  let attachmentCount = 0
  try {
    const kb = await getKnowledgeForMessage(userId, input.content)
    promptBlock = kb.promptBlock
    attachmentCount = kb.attachments.length
  } catch (err) {
    console.error('[cs-pipeline] knowledge error (lanjut tanpa knowledge):', err)
  }

  // 8. Generate balasan.
  const ai = await generateCsReply({
    systemPrompt: promptBlock
      ? cfg.soul.systemPrompt + promptBlock
      : cfg.soul.systemPrompt,
    provider: cfg.model.provider,
    modelId: cfg.model.modelId,
    history,
    latestUserMessage: input.content,
  })
  if (!ai.ok || !ai.reply) {
    if (ai.invalidApiKey) {
      await pauseSession(input.sessionId, ai.error ?? 'API key invalid')
      return stop('paused_invalid_apikey', ai.error)
    }
    return stop('ai_error', ai.error)
  }

  // 9. Charge proporsional dari usage real — SEBELUM kirim (paritas Baileys;
  // biaya provider sudah terjadi walau kirim nanti gagal).
  const charge = await chargeCsReply({
    userId,
    sessionId: input.sessionId,
    aiModelId: cfg.model.id,
    inputTokens: ai.usage?.inputTokens ?? 0,
    outputTokens: ai.usage?.outputTokens ?? 0,
  })
  if (!charge.ok) {
    if (charge.insufficient) {
      await pauseSession(input.sessionId, 'Saldo token habis')
      return stop('paused_no_token')
    }
    return stop('ai_error', 'charge gagal')
  }

  // 10. Kirim + simpan balasan AI (cost fields lengkap untuk profitability).
  if (attachmentCount > 0) {
    // Attachment knowledge butuh media upload API Meta — increment berikutnya.
    console.log(
      `[cs-pipeline] ${attachmentCount} attachment knowledge di-skip (belum didukung Cloud API)`,
    )
  }
  const { sendOk } = await sendAndSaveReply(ai.reply, {
    tokensUsed: charge.tokensCharged ?? 0,
    apiInputTokens: ai.usage?.inputTokens ?? 0,
    apiOutputTokens: ai.usage?.outputTokens ?? 0,
    apiCostRp: charge.apiCostRp ?? 0,
    tokensCharged: charge.tokensCharged ?? 0,
    revenueRp: charge.revenueRp ?? 0,
    profitRp: charge.profitRp ?? 0,
  })

  if (!sendOk) return stop('send_failed')
  return { outcome: 'replied', shouldContinue: true }
}
