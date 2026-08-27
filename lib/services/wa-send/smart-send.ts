// smartSend — satu pintu kirim untuk SEMUA jalur non-CS (OTP, follow-up,
// notif order/subscription, handoff, LMS, test). Mencoba kandidat sesi
// berurutan (lihat listSenderCandidates):
//   BAILEYS   → free-text (tidak ada aturan window Meta)
//   CLOUD_API → window 24 jam terbuka → free-text (gratis)
//               window tutup / free-text ditolak → template APPROVED
//               (templateId eksplisit bila WABA cocok, atau purposeKey)
// Gagal di satu kandidat → lanjut kandidat berikutnya; habis → {code, error}
// gabungan yang jelas. Kontrak: NEVER throw.

import type { SenderCandidate } from '@/lib/wa-session'
import { waService } from '@/lib/wa-service'
import { isWindowOpen } from '@/lib/services/waba/compliance'
import { prisma } from '@/lib/prisma'
import { sendCloudTemplate, type TemplateSendPurpose } from '@/lib/services/waba/send-template'
import type { TemplateSendParams } from '@/lib/services/waba/template-payload'
import { findApprovedTemplate } from '@/lib/services/waba/templates'

export type SmartSendPurpose = Exclude<TemplateSendPurpose, 'CS' | 'BROADCAST'>

export interface SmartSendTemplateSpec {
  /** Template spesifik (dipakai hanya bila wabaId-nya sama dengan kandidat). */
  templateId?: string | null
  /** Alternatif: cari template APPROVED by purposeKey di WABA kandidat. */
  purposeKey?: string | null
  params: TemplateSendParams
}

export interface SmartSendInput {
  candidates: SenderCandidate[]
  to: string
  /** Teks free-form (Baileys / Cloud dalam window). */
  text: string
  template?: SmartSendTemplateSpec
  purpose: SmartSendPurpose
  /** Message.source untuk pesan template Cloud (mis. 'SYSTEM', 'FOLLOWUP'). */
  source: string
  /** default true — Cloud dalam window kirim free-text (gratis) dulu. */
  allowFreeformInWindow?: boolean
  /** Kontak/penerima untuk jejak Message (opsional). */
  contactId?: string
  pushName?: string | null
}

export type SmartSendCode =
  | 'NO_SESSION'
  | 'NO_TEMPLATE'
  | 'INSUFFICIENT_CREDIT'
  | 'MARKETING_OPT_OUT'
  | 'BLACKLISTED'
  | 'WINDOW_CLOSED'
  | 'META_ERROR'
  | 'BAILEYS_ERROR'

export interface SmartSendResult {
  success: boolean
  sessionId?: string
  provider?: 'BAILEYS' | 'CLOUD_API'
  via?: 'BAILEYS' | 'CLOUD_TEXT' | 'CLOUD_TEMPLATE'
  messageId?: string | null
  chargedRp?: number
  templateId?: string | null
  error?: string
  code?: SmartSendCode
  /** Alasan per kandidat (debug/log). */
  attempts: { sessionId: string; via: string; error: string; code?: string }[]
}

function combineError(attempts: SmartSendResult['attempts']): string {
  if (attempts.length === 0) return 'Tidak ada sesi WhatsApp terhubung'
  return attempts.map((a) => `${a.sessionId.slice(-6)}/${a.via}: ${a.error}`).join(' | ')
}

// Prioritas kode gabungan: yang paling "actionable" untuk user.
const CODE_PRIORITY: SmartSendCode[] = [
  'INSUFFICIENT_CREDIT',
  'NO_TEMPLATE',
  'MARKETING_OPT_OUT',
  'BLACKLISTED',
  'WINDOW_CLOSED',
  'META_ERROR',
  'BAILEYS_ERROR',
  'NO_SESSION',
]

function pickCode(codes: (SmartSendCode | undefined)[]): SmartSendCode {
  for (const c of CODE_PRIORITY) if (codes.includes(c)) return c
  return 'NO_SESSION'
}

function mapCloudCode(code: string | undefined): SmartSendCode {
  switch (code) {
    case 'INSUFFICIENT_CREDIT':
      return 'INSUFFICIENT_CREDIT'
    case 'TEMPLATE_NOT_APPROVED':
    case 'TEMPLATE_PAUSED':
    case 'TEMPLATE_WABA_MISMATCH':
    case 'TEMPLATE_PARAM_MISMATCH':
      return 'NO_TEMPLATE'
    case 'MARKETING_OPT_OUT':
      return 'MARKETING_OPT_OUT'
    case 'BLACKLISTED':
      return 'BLACKLISTED'
    case 'WINDOW_CLOSED':
      return 'WINDOW_CLOSED'
    default:
      return 'META_ERROR'
  }
}

async function cloudWindowOpen(userId: string, to: string): Promise<boolean> {
  const phone = to.replace(/\D/g, '')
  const c = await prisma.contact.findFirst({
    where: { userId, phoneNumber: phone },
    select: { windowExpiresAt: true },
    orderBy: { lastMessageAt: 'desc' },
  })
  return isWindowOpen(c?.windowExpiresAt)
}

async function resolveTemplateId(
  cand: SenderCandidate,
  spec: SmartSendTemplateSpec | undefined,
): Promise<string | null> {
  if (!spec || !cand.wabaId) return null
  if (spec.templateId) {
    const t = await prisma.wabaTemplate.findUnique({
      where: { id: spec.templateId },
      select: { wabaId: true, status: true },
    })
    if (t && t.wabaId === cand.wabaId) return spec.templateId
    // Template milik WABA lain → coba purposeKey di WABA kandidat ini.
  }
  if (spec.purposeKey) {
    const t = await findApprovedTemplate({ wabaId: cand.wabaId, purposeKey: spec.purposeKey })
    return t?.id ?? null
  }
  return null
}

export async function smartSend(input: SmartSendInput): Promise<SmartSendResult> {
  const attempts: SmartSendResult['attempts'] = []
  const codes: (SmartSendCode | undefined)[] = []
  const allowFreeform = input.allowFreeformInWindow ?? true

  if (input.candidates.length === 0) {
    return { success: false, code: 'NO_SESSION', error: 'Tidak ada sesi WhatsApp terhubung', attempts }
  }

  for (const cand of input.candidates) {
    try {
      if (cand.provider === 'BAILEYS') {
        const r = await waService.sendMessage(cand.sessionId, input.to, input.text)
        if (r.success) {
          return {
            success: true,
            sessionId: cand.sessionId,
            provider: 'BAILEYS',
            via: 'BAILEYS',
            messageId: r.data?.messageId ?? null,
            chargedRp: 0,
            attempts,
          }
        }
        attempts.push({ sessionId: cand.sessionId, via: 'BAILEYS', error: r.error ?? 'gagal', code: 'BAILEYS_ERROR' })
        codes.push('BAILEYS_ERROR')
        continue
      }

      // ── CLOUD_API ──
      if (allowFreeform && (await cloudWindowOpen(cand.userId, input.to))) {
        const r = await waService.sendMessage(cand.sessionId, input.to, input.text)
        if (r.success) {
          return {
            success: true,
            sessionId: cand.sessionId,
            provider: 'CLOUD_API',
            via: 'CLOUD_TEXT',
            messageId: r.data?.messageId ?? null,
            chargedRp: 0,
            attempts,
          }
        }
        attempts.push({
          sessionId: cand.sessionId,
          via: 'CLOUD_TEXT',
          error: r.error ?? 'gagal',
          code: (r as { code?: string }).code,
        })
        // lanjut coba template di sesi yang sama
      }

      const templateId = await resolveTemplateId(cand, input.template)
      if (!templateId) {
        const why = input.template
          ? `template ${input.template.purposeKey ? `"${input.template.purposeKey}"` : ''} belum APPROVED di WABA ini`
          : 'window 24 jam tutup & tidak ada template'
        attempts.push({ sessionId: cand.sessionId, via: 'CLOUD_TEMPLATE', error: why, code: 'NO_TEMPLATE' })
        codes.push(input.template ? 'NO_TEMPLATE' : 'WINDOW_CLOSED')
        continue
      }
      const r = await sendCloudTemplate({
        sessionId: cand.sessionId,
        to: input.to,
        templateId,
        params: input.template!.params,
        purpose: input.purpose,
        source: input.source,
        contactId: input.contactId,
        pushName: input.pushName ?? null,
      })
      if (r.success) {
        return {
          success: true,
          sessionId: cand.sessionId,
          provider: 'CLOUD_API',
          via: 'CLOUD_TEMPLATE',
          messageId: r.data?.messageId ?? null,
          chargedRp: r.data?.chargedRp ?? 0,
          templateId,
          attempts,
        }
      }
      const code = mapCloudCode(r.code)
      attempts.push({ sessionId: cand.sessionId, via: 'CLOUD_TEMPLATE', error: r.error ?? 'gagal', code: r.code })
      codes.push(code)
    } catch (err) {
      attempts.push({ sessionId: cand.sessionId, via: cand.provider, error: (err as Error).message })
      codes.push(cand.provider === 'BAILEYS' ? 'BAILEYS_ERROR' : 'META_ERROR')
    }
  }

  return { success: false, code: pickCode(codes), error: combineError(attempts), attempts }
}
