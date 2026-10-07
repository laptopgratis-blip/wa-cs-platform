// smartSend — satu pintu kirim untuk SEMUA jalur non-CS (OTP, follow-up,
// notif order/subscription, handoff, LMS, test). Mencoba kandidat sesi
// berurutan (lihat listSenderCandidates):
//   BAILEYS   → free-text (tidak ada aturan window Meta)
//   CLOUD_API → window 24 jam terbuka → free-text (gratis)
//               window tutup / free-text ditolak → template APPROVED
//               (templateId eksplisit bila WABA cocok, atau purposeKey;
//               follow-up opt-in `fallbackFromLinked` → padanan di WABA aktif,
//               lihat wa-send/template-resolution.ts)
// Gagal di satu kandidat → lanjut kandidat berikutnya; habis → {code, error}
// gabungan yang jelas. Kontrak: NEVER throw.

import type { SenderCandidate } from '@/lib/wa-session'
import { waService } from '@/lib/wa-service'
import { isWindowOpen } from '@/lib/services/waba/compliance'
import { prisma } from '@/lib/prisma'
import { CONTACT_RECENCY_ORDER } from '@/lib/services/contacts/recency'
import {
  sendCloudTemplate,
  type TemplateSendPurpose,
} from '@/lib/services/waba/send-template'
import type { TemplateSendParams } from '@/lib/services/waba/template-payload'
import { findApprovedTemplate } from '@/lib/services/waba/templates'
import {
  decideTemplateForCandidate,
  isPermanentCloudCode,
  type ResolvableTemplate,
  type TemplateDecision,
} from '@/lib/services/wa-send/template-resolution'

export type SmartSendPurpose = Exclude<TemplateSendPurpose, 'CS' | 'BROADCAST'>

/**
 * Gambar untuk jalur free-form: by-URL publik (lama) ATAU bytes langsung
 * ("fire and forget" dari image_base64 API publik — tidak ada file yang
 * disimpan platform; Baileys terima buffer, Cloud upload ke media API Meta).
 */
export type SmartSendImage =
  { url: string } | { data: { buffer: Buffer; mime: string } }

function imageParts(image: SmartSendImage | undefined): {
  url?: string
  data?: { buffer: Buffer; mime: string }
} {
  if (!image) return {}
  return 'url' in image ? { url: image.url } : { data: image.data }
}

export interface SmartSendTemplateSpec {
  /** Template spesifik (dipakai hanya bila wabaId-nya sama dengan kandidat). */
  templateId?: string | null
  /** Alternatif: cari template APPROVED by purposeKey di WABA kandidat. */
  purposeKey?: string | null
  /**
   * Opt-in (khusus follow-up): bila template tertaut tidak APPROVED / milik
   * WABA lain, cari padanan purposeKey lalu name+language di WABA kandidat
   * (jumlah variabel wajib sama). Caller lain JANGAN set — perilaku lama.
   */
  fallbackFromLinked?: boolean
  params: TemplateSendParams
}

export interface SmartSendInput {
  candidates: SenderCandidate[]
  to: string
  /** Teks free-form (Baileys / Cloud dalam window). Caption saat image diisi. */
  text: string
  /**
   * Opsional: kirim gambar — URL publik atau buffer (lihat SmartSendImage);
   * text jadi caption. Hanya jalur free-form — template TIDAK bisa membawa
   * gambar arbitrer, jadi kandidat Cloud di luar window dilewati dengan
   * WINDOW_CLOSED (tanpa fallback). URL WAJIB sudah lolos guard SSRF di
   * pemanggil; buffer WAJIB sudah lolos decodeImageBase64.
   */
  image?: SmartSendImage
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
  /**
   * Gagal yang tidak akan sembuh dengan retry (template DRAFT / beda jumlah
   * variabel / tak ada padanan, customer blacklist/opt-out) di SEMUA kandidat.
   */
  permanent?: boolean
  /** Alasan ramah dari kandidat yang menentukan `code` (tanpa prefix sesi). */
  detail?: string
  /** Alasan per kandidat (debug/log). */
  attempts: SmartSendAttempt[]
}

export interface SmartSendAttempt {
  sessionId: string
  via: string
  error: string
  code?: string
  smartCode?: SmartSendCode
  permanent?: boolean
}

function combineError(attempts: SmartSendAttempt[]): string {
  if (attempts.length === 0) return 'Tidak ada sesi WhatsApp terhubung'
  return attempts
    .map((a) => `${a.sessionId.slice(-6)}/${a.via}: ${a.error}`)
    .join(' | ')
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
    orderBy: CONTACT_RECENCY_ORDER,
  })
  return isWindowOpen(c?.windowExpiresAt)
}

const RESOLVE_SELECT = {
  id: true,
  userId: true,
  wabaId: true,
  status: true,
  purposeKey: true,
  name: true,
  language: true,
  category: true,
  bodyText: true,
} as const

type LinkedLoader = () => Promise<ResolvableTemplate | null>

/** Loader template tertaut — dimuat sekali per smartSend (memo), lazy. */
function linkedLoader(spec: SmartSendTemplateSpec | undefined): LinkedLoader {
  let memo: Promise<ResolvableTemplate | null> | undefined
  return () => {
    if (!spec?.templateId) return Promise.resolve(null)
    memo ??= prisma.wabaTemplate.findUnique({
      where: { id: spec.templateId },
      select: RESOLVE_SELECT,
    })
    return memo
  }
}

/** Template di WABA kandidat yang relevan untuk keputusan (lihat template-resolution). */
async function loadWabaTemplates(
  wabaId: string,
  spec: SmartSendTemplateSpec,
  linked: ResolvableTemplate | null,
): Promise<ResolvableTemplate[]> {
  if (!spec.fallbackFromLinked) {
    // Perilaku lama: hanya purposeKey eksplisit, query yang sama persis.
    if (!spec.purposeKey) return []
    const t = await findApprovedTemplate({
      wabaId,
      purposeKey: spec.purposeKey,
    })
    return t ? [t] : []
  }
  const purposeKey = spec.purposeKey ?? linked?.purposeKey ?? null
  const or = [
    ...(purposeKey ? [{ purposeKey }] : []),
    ...(linked
      ? [
          {
            name: linked.name,
            language: linked.language,
            userId: linked.userId,
          },
        ]
      : []),
  ]
  if (or.length === 0) return []
  return prisma.wabaTemplate.findMany({
    where: { wabaId, OR: or },
    select: RESOLVE_SELECT,
    orderBy: { approvedAt: 'desc' },
  })
}

/** Template sudah pasti dipakai tanpa perlu memuat template lain di WABA. */
function linkedIsFinal(
  spec: SmartSendTemplateSpec,
  linked: ResolvableTemplate | null,
  wabaId: string,
): boolean {
  if (!linked || linked.wabaId !== wabaId) return false
  return spec.fallbackFromLinked ? linked.status === 'APPROVED' : true
}

async function resolveTemplate(
  cand: SenderCandidate,
  spec: SmartSendTemplateSpec | undefined,
  getLinked: LinkedLoader,
): Promise<TemplateDecision> {
  if (!spec) {
    return {
      ok: false,
      reason: 'NO_TEMPLATE',
      permanent: false,
      message: 'window 24 jam tutup & tidak ada template',
    }
  }
  if (!cand.wabaId) {
    if (spec.fallbackFromLinked) {
      return {
        ok: false,
        reason: 'NO_TEMPLATE',
        permanent: false,
        message: 'sesi Cloud API tanpa WABA ID — hubungkan ulang nomor',
      }
    }
    // Perilaku lama: pesan "belum APPROVED" generik.
    return decideTemplateForCandidate({
      candidateWabaId: '',
      purposeKey: spec.purposeKey,
      paramCount: spec.params.body.length,
      linked: null,
      wabaTemplates: [],
    })
  }
  const linked = await getLinked()
  const wabaTemplates = linkedIsFinal(spec, linked, cand.wabaId)
    ? []
    : await loadWabaTemplates(cand.wabaId, spec, linked)
  return decideTemplateForCandidate({
    candidateWabaId: cand.wabaId,
    templateId: spec.templateId,
    purposeKey: spec.purposeKey,
    fallbackFromLinked: spec.fallbackFromLinked,
    paramCount: spec.params.body.length,
    linked,
    wabaTemplates,
  })
}

function failureResult(
  attempts: SmartSendAttempt[],
  codes: (SmartSendCode | undefined)[],
  permanents: boolean[],
): SmartSendResult {
  const code = pickCode(codes)
  return {
    success: false,
    code,
    error: combineError(attempts),
    detail: attempts.find((a) => a.smartCode === code)?.error,
    permanent: permanents.length > 0 && permanents.every(Boolean),
    attempts,
  }
}

export async function smartSend(
  input: SmartSendInput,
): Promise<SmartSendResult> {
  const attempts: SmartSendAttempt[] = []
  const codes: (SmartSendCode | undefined)[] = []
  // Paralel dengan `codes`: apakah kegagalan final kandidat itu permanen.
  const permanents: boolean[] = []
  const getLinked = linkedLoader(input.template)
  const allowFreeform = input.allowFreeformInWindow ?? true
  const img = imageParts(input.image)

  if (input.candidates.length === 0) {
    return {
      success: false,
      code: 'NO_SESSION',
      error: 'Tidak ada sesi WhatsApp terhubung',
      attempts,
    }
  }

  for (const cand of input.candidates) {
    try {
      if (cand.provider === 'BAILEYS') {
        const r = await waService.sendMessage(
          cand.sessionId,
          input.to,
          input.text,
          img.url,
          img.data,
        )
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
        attempts.push({
          sessionId: cand.sessionId,
          via: 'BAILEYS',
          error: r.error ?? 'gagal',
          code: 'BAILEYS_ERROR',
          smartCode: 'BAILEYS_ERROR',
          permanent: false,
        })
        codes.push('BAILEYS_ERROR')
        permanents.push(false)
        continue
      }

      // ── CLOUD_API ──
      if (allowFreeform && (await cloudWindowOpen(cand.userId, input.to))) {
        const r = await waService.sendMessage(
          cand.sessionId,
          input.to,
          input.text,
          img.url,
          img.data,
        )
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

      // Gambar tidak bisa dibawa template arbitrer (header template harus
      // disetujui Meta per-template) → jangan fallback, catat sebagai window
      // tutup supaya pesan errornya actionable.
      if (input.image) {
        attempts.push({
          sessionId: cand.sessionId,
          via: 'CLOUD_TEMPLATE',
          error:
            'gambar hanya bisa dikirim free-form dalam window 24 jam — tidak ada fallback template',
          code: 'WINDOW_CLOSED',
          smartCode: 'WINDOW_CLOSED',
          permanent: false,
        })
        codes.push('WINDOW_CLOSED')
        permanents.push(false)
        continue
      }

      const decision = await resolveTemplate(cand, input.template, getLinked)
      if (!decision.ok) {
        const smartCode: SmartSendCode = input.template
          ? 'NO_TEMPLATE'
          : 'WINDOW_CLOSED'
        attempts.push({
          sessionId: cand.sessionId,
          via: 'CLOUD_TEMPLATE',
          error: decision.message,
          code: 'NO_TEMPLATE',
          smartCode,
          permanent: decision.permanent,
        })
        codes.push(smartCode)
        permanents.push(decision.permanent)
        continue
      }
      const templateId = decision.templateId
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
      const permanent = isPermanentCloudCode(r.code)
      attempts.push({
        sessionId: cand.sessionId,
        via: 'CLOUD_TEMPLATE',
        error: r.error ?? 'gagal',
        code: r.code,
        smartCode: code,
        permanent,
      })
      codes.push(code)
      permanents.push(permanent)
    } catch (err) {
      const smartCode: SmartSendCode =
        cand.provider === 'BAILEYS' ? 'BAILEYS_ERROR' : 'META_ERROR'
      attempts.push({
        sessionId: cand.sessionId,
        via: cand.provider,
        error: (err as Error).message,
        smartCode,
        permanent: false,
      })
      codes.push(smartCode)
      permanents.push(false)
    }
  }

  return failureResult(attempts, codes, permanents)
}
