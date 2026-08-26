// Kirim pesan lewat API publik seller (POST /api/v1/messages*, Fase 2).
//
// Membungkus `smartSend` yang sudah never-throw & sadar provider/window/
// compliance — kita hanya menyiapkan kandidat sesi (MILIK USER ini saja) dan
// menerjemahkan hasilnya ke bentuk API + kode HTTP.
import { prisma } from '@/lib/prisma'
import { listSenderCandidates } from '@/lib/wa-session'
import { smartSend, type SmartSendCode } from '@/lib/services/wa-send/smart-send'
import type { TemplateSendParams } from '@/lib/services/waba/template-payload'

export interface PublicSendOutcome {
  ok: boolean
  httpStatus: number
  code?: string
  error?: string
  data?: {
    externalMsgId: string | null
    provider: 'BAILEYS' | 'CLOUD_API' | null
    via: string | null
    to: string
  }
}

// smartSend code → HTTP + pesan siap-API.
function mapFailure(code: SmartSendCode | undefined, error: string | undefined): PublicSendOutcome {
  const err = error ?? 'Gagal mengirim pesan'
  switch (code) {
    case 'NO_SESSION':
      return { ok: false, httpStatus: 409, code: 'no_session', error: 'Tidak ada sesi WhatsApp terhubung.' }
    case 'WINDOW_CLOSED':
      return {
        ok: false,
        httpStatus: 409,
        code: 'window_closed',
        error: 'Window 24 jam tutup — kirim lewat /messages/template dengan template yang disetujui.',
      }
    case 'NO_TEMPLATE':
      return { ok: false, httpStatus: 409, code: 'no_template', error: 'Template yang cocok tidak ditemukan/disetujui.' }
    case 'INSUFFICIENT_CREDIT':
      return { ok: false, httpStatus: 402, code: 'insufficient_credit', error: err }
    case 'MARKETING_OPT_OUT':
      return { ok: false, httpStatus: 409, code: 'marketing_opt_out', error: 'Kontak menolak pesan marketing.' }
    case 'BLACKLISTED':
      return { ok: false, httpStatus: 409, code: 'blacklisted', error: 'Kontak masuk blacklist.' }
    default:
      return { ok: false, httpStatus: 502, code: 'send_failed', error: err }
  }
}

/**
 * Kandidat sesi MILIK user. session_id (bila ada) diverifikasi kepemilikannya
 * dulu — listSenderCandidates meng-OR explicitSessionIds dengan userId, jadi
 * tanpa verifikasi, id sesi milik orang lain bisa ikut (IDOR). Hasil akhir
 * tetap difilter ke userId sebagai lapis kedua.
 */
async function ownedCandidates(userId: string, to: string, sessionId?: string) {
  let explicit: string[] | undefined
  if (sessionId) {
    const s = await prisma.whatsappSession.findFirst({
      where: { id: sessionId, userId },
      select: { id: true },
    })
    if (!s) return { error: 'session_id tidak ditemukan di akunmu' as const }
    explicit = [sessionId]
  }
  const cands = await listSenderCandidates({
    userId,
    explicitSessionIds: explicit,
    preferContactPhone: to,
  })
  return { candidates: cands.filter((c) => c.userId === userId) }
}

export async function sendPublicText(input: {
  userId: string
  to: string
  content: string
  sessionId?: string
}): Promise<PublicSendOutcome> {
  const owned = await ownedCandidates(input.userId, input.to, input.sessionId)
  if ('error' in owned) return { ok: false, httpStatus: 404, code: 'not_found', error: owned.error }

  const res = await smartSend({
    candidates: owned.candidates,
    to: input.to,
    text: input.content,
    purpose: 'NOTIF',
    source: 'API',
    // Teks bebas: dalam window (atau Baileys). Di luar window Cloud tanpa
    // template → WINDOW_CLOSED (arahkan ke endpoint template).
    allowFreeformInWindow: true,
  })
  if (!res.success) return mapFailure(res.code, res.error)
  return {
    ok: true,
    httpStatus: 200,
    data: { externalMsgId: res.messageId ?? null, provider: res.provider ?? null, via: res.via ?? null, to: input.to },
  }
}

export async function sendPublicTemplate(input: {
  userId: string
  to: string
  templateId?: string
  templateName?: string
  params: string[]
  sessionId?: string
}): Promise<PublicSendOutcome> {
  // Resolusi template MILIK user (APPROVED). Dukung by id atau by name.
  const template = await prisma.wabaTemplate.findFirst({
    where: {
      userId: input.userId,
      status: 'APPROVED',
      ...(input.templateId ? { id: input.templateId } : {}),
      ...(input.templateName ? { name: input.templateName } : {}),
    },
    select: { id: true, bodyText: true },
  })
  if (!template) {
    return { ok: false, httpStatus: 404, code: 'template_not_found', error: 'Template tidak ditemukan / belum disetujui.' }
  }

  const owned = await ownedCandidates(input.userId, input.to, input.sessionId)
  if ('error' in owned) return { ok: false, httpStatus: 404, code: 'not_found', error: owned.error }

  const sendParams: TemplateSendParams = { body: input.params }
  // Teks yang dikirim lewat Baileys / Cloud-in-window (bila fallback perlu) =
  // body template dengan {{n}} tersubstitusi. Cloud di luar window tetap
  // memakai template APPROVED (allowFreeformInWindow:false → selalu template).
  const rendered = renderTemplateBody(template.bodyText, input.params)

  const res = await smartSend({
    candidates: owned.candidates,
    to: input.to,
    text: rendered,
    template: { templateId: template.id, params: sendParams },
    purpose: 'NOTIF',
    source: 'API',
    allowFreeformInWindow: false,
  })
  if (!res.success) return mapFailure(res.code, res.error)
  return {
    ok: true,
    httpStatus: 200,
    data: { externalMsgId: res.messageId ?? null, provider: res.provider ?? null, via: res.via ?? null, to: input.to },
  }
}

/** Ganti {{1}}..{{n}} di body template dengan params (index 0 = {{1}}). */
export function renderTemplateBody(body: string, params: string[]): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => {
    const idx = Number(n) - 1
    return params[idx] ?? ''
  })
}
