// Keputusan template Meta per kandidat sesi Cloud API — PURE (tanpa prisma).
// smartSend memuat data (template tertaut + template di WABA kandidat), lalu
// fungsi ini memutuskan template mana yang dipakai atau kenapa gagal.
//
// Dua mode:
// - Default (perilaku lama, dipakai API publik, OTP, notif INFO_GENERIC):
//   templateId dipakai bila WABA-nya sama (status dicek sendCloudTemplate),
//   selain itu purposeKey APPROVED di WABA kandidat. Tidak ada fallback lain.
// - `fallbackFromLinked` (khusus follow-up): template tertaut wajib APPROVED;
//   bila tidak/beda WABA → padanan purposeKey milik template tertaut →
//   padanan name+language (pemilik sama). Fallback WAJIB jumlah variabel body
//   sama supaya metaParamMap tetap valid. Gagal → alasan actionable +
//   klasifikasi permanen (jangan retry) vs transient (tunggu review Meta).

import { expectedBodyParamCount } from '@/lib/services/waba/template-payload'

export interface ResolvableTemplate {
  id: string
  userId: string
  wabaId: string
  status: string
  purposeKey: string | null
  name: string
  language: string
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  bodyText: string
}

export interface TemplateResolutionInput {
  candidateWabaId: string
  templateId?: string | null
  purposeKey?: string | null
  fallbackFromLinked?: boolean
  /** Jumlah nilai body yang akan dikirim (dipakai bila tak ada template tertaut). */
  paramCount: number
  /** Baris WabaTemplate untuk `templateId` (null = tidak ada / sudah terhapus). */
  linked: ResolvableTemplate | null
  /** Template di WABA kandidat yang relevan (purposeKey / name+language). */
  wabaTemplates: ResolvableTemplate[]
}

export type TemplateDecision =
  | { ok: true; templateId: string; via: 'LINKED' | 'PURPOSE' | 'NAME' }
  | { ok: false; reason: 'NO_TEMPLATE'; permanent: boolean; message: string }

// Status yang bisa berubah jadi APPROVED tanpa tindakan seller.
const TRANSIENT_STATUSES = new Set(['PENDING', 'IN_APPEAL', 'PAUSED'])

// Kode gagal sendCloudTemplate yang tidak akan sembuh dengan retry.
const PERMANENT_CLOUD_CODES = new Set([
  'TEMPLATE_PARAM_MISMATCH',
  'TEMPLATE_WABA_MISMATCH',
  'BLACKLISTED',
  'MARKETING_OPT_OUT',
])

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'menunggu review Meta',
  IN_APPEAL: 'dalam proses banding di Meta',
  PAUSED: 'dijeda Meta (PAUSED)',
  DRAFT: 'masih DRAFT (belum diajukan ke Meta)',
  REJECTED: 'ditolak Meta (REJECTED)',
  DISABLED: 'dinonaktifkan Meta (DISABLED)',
  DELETED: 'sudah dihapus (DELETED)',
  LIMIT_EXCEEDED: 'melebihi batas Meta (LIMIT_EXCEEDED)',
}

const RELINK_HINT = 'pilih ulang Template Meta di pengaturan follow-up'

export function isTransientTemplateStatus(status: string): boolean {
  return TRANSIENT_STATUSES.has(status)
}

export function isPermanentCloudCode(code: string | undefined): boolean {
  return code !== undefined && PERMANENT_CLOUD_CODES.has(code)
}

function fail(permanent: boolean, message: string): TemplateDecision {
  return { ok: false, reason: 'NO_TEMPLATE', permanent, message }
}

/** Perilaku lama smartSend.resolveTemplateId — JANGAN diubah. */
function decideLegacy(input: TemplateResolutionInput): TemplateDecision {
  const { linked, candidateWabaId } = input
  if (input.templateId && linked && linked.wabaId === candidateWabaId) {
    return { ok: true, templateId: linked.id, via: 'LINKED' }
  }
  if (input.purposeKey) {
    const hit = input.wabaTemplates.find(
      (t) =>
        t.wabaId === candidateWabaId &&
        t.purposeKey === input.purposeKey &&
        t.status === 'APPROVED',
    )
    if (hit) return { ok: true, templateId: hit.id, via: 'PURPOSE' }
  }
  const label = input.purposeKey ? `template "${input.purposeKey}"` : 'template'
  return fail(false, `${label} belum APPROVED di WABA ini`)
}

/** Template di WABA kandidat yang setara dengan template tertaut. */
function equivalents(input: TemplateResolutionInput): {
  byPurpose: ResolvableTemplate[]
  byName: ResolvableTemplate[]
} {
  const { linked, candidateWabaId } = input
  const purposeKey = input.purposeKey ?? linked?.purposeKey ?? null
  const inWaba = input.wabaTemplates.filter(
    (t) => t.wabaId === candidateWabaId && t.id !== linked?.id,
  )
  const byPurpose = purposeKey ? inWaba.filter((t) => t.purposeKey === purposeKey) : []
  const byName = linked
    ? inWaba.filter(
        (t) =>
          t.name === linked.name &&
          t.language === linked.language &&
          t.userId === linked.userId,
      )
    : []
  return { byPurpose, byName }
}

function explainFailure(
  input: TemplateResolutionInput,
  related: ResolvableTemplate[],
  expected: number,
): TemplateDecision {
  const transient = related.find(
    (t) => isTransientTemplateStatus(t.status) && expectedBodyParamCount(t) === expected,
  )
  if (transient) {
    return fail(
      false,
      `Template Meta "${transient.name}" ${STATUS_LABEL[transient.status]} — follow-up dicoba lagi otomatis`,
    )
  }
  const mismatch = related.find((t) => t.status === 'APPROVED')
  if (mismatch) {
    return fail(
      true,
      `Template Meta "${mismatch.name}" di WABA nomor pengirim punya ${expectedBodyParamCount(mismatch)} variabel, ` +
        `sedangkan follow-up ini memetakan ${expected} — ${RELINK_HINT}`,
    )
  }
  const other = related[0]
  if (other) {
    const label = STATUS_LABEL[other.status] ?? `berstatus ${other.status}`
    const action =
      other.status === 'DRAFT'
        ? 'ajukan ke Meta dulu (Starter Pack di halaman Template WA)'
        : RELINK_HINT
    return fail(true, `Template Meta "${other.name}" di WABA nomor pengirim ${label} — ${action}`)
  }
  const { linked } = input
  if (!linked) return fail(true, `Template Meta tertaut sudah tidak ada — ${RELINK_HINT}`)
  return fail(
    true,
    `Template Meta "${linked.name}" tertaut ke WABA lain (nomor lama?) dan tidak ada padanan APPROVED ` +
      `di WABA nomor pengirim — ${RELINK_HINT}`,
  )
}

function decideWithFallback(input: TemplateResolutionInput): TemplateDecision {
  const { linked, candidateWabaId } = input
  const sameWaba = linked !== null && linked.wabaId === candidateWabaId
  if (sameWaba && linked.status === 'APPROVED') {
    return { ok: true, templateId: linked.id, via: 'LINKED' }
  }

  const expected = linked ? expectedBodyParamCount(linked) : input.paramCount
  const usable = (t: ResolvableTemplate) =>
    t.status === 'APPROVED' && expectedBodyParamCount(t) === expected
  const { byPurpose, byName } = equivalents(input)

  const purposeHit = byPurpose.find(usable)
  if (purposeHit) return { ok: true, templateId: purposeHit.id, via: 'PURPOSE' }
  const nameHit = byName.find(usable)
  if (nameHit) return { ok: true, templateId: nameHit.id, via: 'NAME' }

  const related = [...(sameWaba ? [linked] : []), ...byPurpose, ...byName]
  return explainFailure(input, related, expected)
}

export function decideTemplateForCandidate(input: TemplateResolutionInput): TemplateDecision {
  return input.fallbackFromLinked === true ? decideWithFallback(input) : decideLegacy(input)
}
