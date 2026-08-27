// Validasi draft template Meta — PURE (tanpa prisma/env) supaya bisa dipakai
// di client (editor) maupun server (API). Aturan mengikuti batasan Meta:
// developers.facebook.com/docs/whatsapp/business-management-api/message-templates
//
// Keluaran: errors (blokir submit) + warnings (kemungkinan ditolak reviewer).

import type { WabaTemplateButton } from './types'

export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
export type TemplateHeaderType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'

export interface TemplateDraftInput {
  name: string
  language: string
  category: TemplateCategory
  headerType?: TemplateHeaderType | null
  headerText?: string | null
  headerTextExample?: string | null
  headerMediaHandle?: string | null
  headerMediaUrl?: string | null
  bodyText: string
  bodyExamples?: string[] | null
  footerText?: string | null
  buttons?: WabaTemplateButton[] | null
  authAddSecurityRecommendation?: boolean | null
  authCodeExpirationMinutes?: number | null
}

export interface TemplateValidation {
  ok: boolean
  errors: string[]
  warnings: string[]
}

export const TEMPLATE_LIMITS = {
  NAME_MAX: 512,
  BODY_MAX: 1024,
  FOOTER_MAX: 60,
  HEADER_TEXT_MAX: 60,
  BUTTON_TEXT_MAX: 25,
  BUTTON_URL_MAX: 2000,
  BUTTONS_MAX: 10,
  URL_BUTTONS_MAX: 2,
  PHONE_BUTTONS_MAX: 1,
  COPY_CODE_BUTTONS_MAX: 1,
  AUTH_CODE_EXPIRY_MIN: 1,
  AUTH_CODE_EXPIRY_MAX: 90,
  EMOJI_WARN_AT: 10,
} as const

const NAME_RE = /^[a-z0-9_]+$/
const PLACEHOLDER_RE = /\{\{\s*(\d+)\s*\}\}/g
// Deteksi emoji kasar (Extended_Pictographic) — cukup untuk warning.
const EMOJI_RE = /\p{Extended_Pictographic}/gu

/** Ambil nomor placeholder `{{n}}` sesuai urutan kemunculan (boleh dobel). */
export function extractPlaceholders(text: string | null | undefined): number[] {
  if (!text) return []
  const out: number[] = []
  for (const m of text.matchAll(PLACEHOLDER_RE)) out.push(Number(m[1]))
  return out
}

/** Jumlah variabel unik tertinggi pada teks ({{1}}..{{n}} → n). */
export function countPlaceholders(text: string | null | undefined): number {
  const nums = extractPlaceholders(text)
  return nums.length ? Math.max(...nums) : 0
}

/** Apakah `{{n}}` sekuensial 1..n tanpa jeda (1-based — aturan Meta). */
export function placeholdersSequential(nums: number[]): boolean {
  const uniq = Array.from(new Set(nums)).sort((a, b) => a - b)
  return uniq.every((n, i) => n === i + 1)
}

/** Slug nama template dari judul bebas: huruf kecil, angka, underscore. */
export function slugifyTemplateName(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, TEMPLATE_LIMITS.NAME_MAX)
}

function countEmoji(text: string): number {
  return (text.match(EMOJI_RE) ?? []).length
}

function validateBody(draft: TemplateDraftInput, errors: string[], warnings: string[]): void {
  const body = draft.bodyText ?? ''
  if (!body.trim()) {
    errors.push('Isi pesan (body) wajib diisi')
    return
  }
  if (body.length > TEMPLATE_LIMITS.BODY_MAX) {
    errors.push(`Body maksimal ${TEMPLATE_LIMITS.BODY_MAX} karakter (sekarang ${body.length})`)
  }
  const nums = extractPlaceholders(body)
  if (!placeholdersSequential(nums)) {
    errors.push('Variabel body harus berurutan mulai {{1}}, {{2}}, … tanpa loncat')
  }
  const n = nums.length ? Math.max(...nums) : 0
  const examples = draft.bodyExamples ?? []
  for (let i = 0; i < n; i += 1) {
    if (!examples[i]?.trim()) errors.push(`Contoh nilai untuk {{${i + 1}}} wajib diisi (dipakai reviewer Meta)`)
  }
  const trimmed = body.trim()
  if (/^\{\{\s*\d+\s*\}\}/.test(trimmed)) errors.push('Body tidak boleh DIAWALI variabel — tambahkan teks di depannya')
  if (/\{\{\s*\d+\s*\}\}$/.test(trimmed)) errors.push('Body tidak boleh DIAKHIRI variabel — tambahkan teks di belakangnya')
  if (/\}\}\s*\{\{/.test(body)) warnings.push('Dua variabel berdampingan tanpa teks — Meta sering menolak; pisahkan dengan kata')
  if (n > 0 && body.replace(PLACEHOLDER_RE, '').trim().length < n * 8) {
    warnings.push('Terlalu banyak variabel dibanding panjang teks — risiko ditolak "variable parameter count"')
  }
  const emoji = countEmoji(body)
  if (emoji > TEMPLATE_LIMITS.EMOJI_WARN_AT) warnings.push(`Emoji terlalu banyak (${emoji}) — kurangi supaya tidak ditolak`)
}

function validateHeader(draft: TemplateDraftInput, errors: string[]): void {
  const type = draft.headerType ?? null
  if (!type) return
  if (type === 'TEXT') {
    const text = draft.headerText ?? ''
    if (!text.trim()) errors.push('Teks header wajib diisi bila tipe header TEXT')
    if (text.length > TEMPLATE_LIMITS.HEADER_TEXT_MAX) {
      errors.push(`Header maksimal ${TEMPLATE_LIMITS.HEADER_TEXT_MAX} karakter`)
    }
    const nums = extractPlaceholders(text)
    if (nums.length > 1 || (nums.length === 1 && nums[0] !== 1)) {
      errors.push('Header hanya boleh memuat satu variabel, yaitu {{1}}')
    }
    if (nums.length === 1 && !draft.headerTextExample?.trim()) {
      errors.push('Contoh nilai variabel header wajib diisi')
    }
    if (countEmoji(text) > 0) errors.push('Header teks tidak boleh memuat emoji')
    return
  }
  if (!draft.headerMediaHandle?.trim()) {
    errors.push(`Header ${type} butuh file contoh — unggah dulu (Resumable Upload Meta)`)
  }
}

function validateFooter(draft: TemplateDraftInput, errors: string[]): void {
  const footer = draft.footerText ?? ''
  if (footer.length > TEMPLATE_LIMITS.FOOTER_MAX) {
    errors.push(`Footer maksimal ${TEMPLATE_LIMITS.FOOTER_MAX} karakter`)
  }
  if (extractPlaceholders(footer).length > 0) errors.push('Footer tidak boleh memuat variabel')
}

function validateButtons(draft: TemplateDraftInput, errors: string[], warnings: string[]): void {
  const buttons = draft.buttons ?? []
  if (buttons.length > TEMPLATE_LIMITS.BUTTONS_MAX) {
    errors.push(`Maksimal ${TEMPLATE_LIMITS.BUTTONS_MAX} tombol`)
  }
  const counts = { URL: 0, PHONE_NUMBER: 0, COPY_CODE: 0, QUICK_REPLY: 0, OTP: 0 }
  buttons.forEach((b, i) => {
    counts[b.type] += 1
    const label = `Tombol #${i + 1}`
    if ('text' in b && b.text !== undefined) {
      if (!b.text.trim()) errors.push(`${label}: teks tombol wajib diisi`)
      if (b.text.length > TEMPLATE_LIMITS.BUTTON_TEXT_MAX) {
        errors.push(`${label}: teks tombol maksimal ${TEMPLATE_LIMITS.BUTTON_TEXT_MAX} karakter`)
      }
    }
    if (b.type === 'URL') {
      if (!/^https?:\/\//i.test(b.url ?? '')) errors.push(`${label}: URL harus diawali http(s)://`)
      if ((b.url ?? '').length > TEMPLATE_LIMITS.BUTTON_URL_MAX) errors.push(`${label}: URL terlalu panjang`)
      const nums = extractPlaceholders(b.url)
      if (nums.length > 1 || (nums.length === 1 && nums[0] !== 1)) {
        errors.push(`${label}: URL dinamis hanya boleh satu variabel {{1}} di akhir`)
      }
      if (nums.length === 1 && !/\{\{\s*1\s*\}\}\s*$/.test(b.url)) {
        errors.push(`${label}: variabel URL harus berada di AKHIR URL`)
      }
      if (nums.length === 1 && !b.example?.trim()) {
        errors.push(`${label}: contoh nilai sufiks URL wajib diisi`)
      }
    }
    if (b.type === 'PHONE_NUMBER' && !/^\+?\d{7,15}$/.test(b.phone_number ?? '')) {
      errors.push(`${label}: nomor telepon harus format internasional, mis. +6281234567890`)
    }
    if (b.type === 'COPY_CODE') {
      if (!b.example?.trim()) errors.push(`${label}: contoh kode kupon wajib diisi`)
      if ((b.example ?? '').length > 15) errors.push(`${label}: kode kupon maksimal 15 karakter`)
    }
  })
  if (counts.URL > TEMPLATE_LIMITS.URL_BUTTONS_MAX) errors.push('Maksimal 2 tombol URL')
  if (counts.PHONE_NUMBER > TEMPLATE_LIMITS.PHONE_BUTTONS_MAX) errors.push('Maksimal 1 tombol telepon')
  if (counts.COPY_CODE > TEMPLATE_LIMITS.COPY_CODE_BUTTONS_MAX) errors.push('Maksimal 1 tombol salin kode')
  if (counts.QUICK_REPLY > 0 && (counts.URL > 0 || counts.PHONE_NUMBER > 0)) {
    warnings.push('Campuran Quick Reply dan URL/telepon harus dikelompokkan (Meta mengurutkan otomatis)')
  }
  if (draft.category !== 'AUTHENTICATION' && counts.OTP > 0) {
    errors.push('Tombol OTP hanya untuk kategori AUTHENTICATION')
  }
}

function validateAuth(draft: TemplateDraftInput, errors: string[]): void {
  // AUTH: body & footer dibuat Meta (add_security_recommendation,
  // code_expiration_minutes); user tidak boleh mengisi teks bebas.
  if (draft.headerType) errors.push('Template AUTHENTICATION tidak boleh punya header')
  if ((draft.footerText ?? '').trim()) errors.push('Footer AUTHENTICATION diisi otomatis oleh Meta — kosongkan')
  const buttons = draft.buttons ?? []
  const otp = buttons.filter((b) => b.type === 'OTP')
  if (otp.length !== 1 || buttons.length !== 1) {
    errors.push('Template AUTHENTICATION wajib tepat satu tombol OTP (salin kode)')
  }
  const exp = draft.authCodeExpirationMinutes
  if (exp !== null && exp !== undefined) {
    if (!Number.isInteger(exp) || exp < TEMPLATE_LIMITS.AUTH_CODE_EXPIRY_MIN || exp > TEMPLATE_LIMITS.AUTH_CODE_EXPIRY_MAX) {
      errors.push(`Masa berlaku kode harus ${TEMPLATE_LIMITS.AUTH_CODE_EXPIRY_MIN}–${TEMPLATE_LIMITS.AUTH_CODE_EXPIRY_MAX} menit`)
    }
  }
  if (extractPlaceholders(draft.bodyText).length > 0) {
    errors.push('Body AUTHENTICATION tidak boleh memuat variabel — kode OTP disisipkan Meta otomatis')
  }
}

/** Validasi lengkap satu draft. Tidak throw. */
export function validateTemplateDraft(draft: TemplateDraftInput): TemplateValidation {
  const errors: string[] = []
  const warnings: string[] = []

  const name = draft.name ?? ''
  if (!name) errors.push('Nama template wajib diisi')
  else if (!NAME_RE.test(name)) errors.push('Nama template hanya huruf kecil, angka, dan underscore (_)')
  else if (name.length > TEMPLATE_LIMITS.NAME_MAX) errors.push('Nama template terlalu panjang')

  if (!draft.language?.trim()) errors.push('Bahasa template wajib diisi (mis. id, en_US)')
  if (!['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(draft.category)) {
    errors.push('Kategori tidak valid')
  }

  if (draft.category === 'AUTHENTICATION') {
    validateAuth(draft, errors)
    validateButtons(draft, errors, warnings)
  } else {
    validateBody(draft, errors, warnings)
    validateHeader(draft, errors)
    validateFooter(draft, errors)
    validateButtons(draft, errors, warnings)
  }

  return { ok: errors.length === 0, errors, warnings }
}
