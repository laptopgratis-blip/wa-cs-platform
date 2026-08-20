// Pemetaan template hulao ⇄ payload Graph API Meta (create/edit/send) +
// render teks untuk preview & Message.content. PURE (tanpa prisma).
//
// Catatan dok Meta yang sering salah di implementasi lain:
// - Template AUTHENTICATION dikirim dengan body param = kode DAN tombol
//   `sub_type:'url'` index '0' param text = kode (BUKAN coupon_code).
// - Nilai parameter tidak boleh memuat newline/tab/>4 spasi berurutan →
//   selalu lewat `flattenParamValue`.
// - Contoh header media memakai `header_handle` dari Resumable Upload,
//   bukan media_id dari /media.

import { extractPlaceholders } from './template-validate'
import type { WabaTemplateButton } from './types'

export type TemplateHeaderType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'

/** Subset kolom WabaTemplate yang dibutuhkan builder (kompatibel Prisma row). */
export interface TemplateLike {
  name: string
  language: string
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  headerType?: string | null
  headerText?: string | null
  headerTextExample?: string | null
  headerMediaHandle?: string | null
  headerMediaUrl?: string | null
  bodyText: string
  bodyExamples?: string[] | null
  footerText?: string | null
  buttons?: unknown // Json dari Prisma → WabaTemplateButton[]
  authAddSecurityRecommendation?: boolean | null
  authCodeExpirationMinutes?: number | null
}

export interface TemplateSendHeaderParam {
  type: 'text' | 'image' | 'video' | 'document'
  value: string // teks {{1}} header, atau URL publik media
  filename?: string // document
}

export interface TemplateSendButtonParam {
  index: number // posisi tombol di template (0-based)
  subType: 'url' | 'copy_code' | 'quick_reply'
  value: string // sufiks URL | kode kupon | payload quick reply
}

export interface TemplateSendParams {
  header?: TemplateSendHeaderParam
  body: string[] // nilai {{1}}..{{n}} (index 0 = {{1}})
  buttons?: TemplateSendButtonParam[]
}

/** Ambil tombol dari kolom Json dengan aman. */
export function readTemplateButtons(raw: unknown): WabaTemplateButton[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (b): b is WabaTemplateButton =>
      Boolean(b) && typeof b === 'object' && typeof (b as { type?: unknown }).type === 'string',
  )
}

/**
 * Meta menolak parameter yang memuat newline, tab, atau >4 spasi berurutan.
 * Baris baru → ", " supaya daftar (mis. produk) tetap terbaca.
 */
export function flattenParamValue(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return s
    .replace(/\r\n|\r|\n/g, ', ')
    .replace(/\t/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/(, )+/g, ', ')
    .replace(/^(, )+|(, )+$/g, '')
    .trim()
}

function substitute(text: string, values: string[]): string {
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n: string) => {
    const v = values[Number(n) - 1]
    return v === undefined ? `{{${n}}}` : v
  })
}

// ── Create / Edit ──

function buildUrlButtonExample(url: string, example?: string): string[] | undefined {
  if (extractPlaceholders(url).length === 0) return undefined
  // Meta minta contoh URL LENGKAP (sufiks sudah disubstitusi).
  return [url.replace(/\{\{\s*1\s*\}\}/, example ?? 'contoh')]
}

function buildButtonsComponent(tpl: TemplateLike): Record<string, unknown> | null {
  const buttons = readTemplateButtons(tpl.buttons)
  if (buttons.length === 0) return null
  const mapped = buttons.map((b) => {
    switch (b.type) {
      case 'QUICK_REPLY':
        return { type: 'QUICK_REPLY', text: b.text }
      case 'URL': {
        const example = buildUrlButtonExample(b.url, b.example)
        return { type: 'URL', text: b.text, url: b.url, ...(example ? { example } : {}) }
      }
      case 'PHONE_NUMBER':
        return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone_number }
      case 'COPY_CODE':
        return { type: 'COPY_CODE', example: b.example }
      case 'OTP':
        return { type: 'OTP', otp_type: 'COPY_CODE', ...(b.text ? { text: b.text } : {}) }
      default:
        return null
    }
  })
  return { type: 'BUTTONS', buttons: mapped.filter(Boolean) }
}

/** Komponen untuk POST /{wabaId}/message_templates dan POST /{templateId}. */
export function buildTemplateComponents(tpl: TemplateLike): Record<string, unknown>[] {
  const components: Record<string, unknown>[] = []

  if (tpl.category === 'AUTHENTICATION') {
    components.push({
      type: 'BODY',
      add_security_recommendation: tpl.authAddSecurityRecommendation ?? true,
    })
    if (tpl.authCodeExpirationMinutes) {
      components.push({ type: 'FOOTER', code_expiration_minutes: tpl.authCodeExpirationMinutes })
    }
    const buttons = readTemplateButtons(tpl.buttons)
    const otp = buttons.find((b) => b.type === 'OTP')
    components.push({
      type: 'BUTTONS',
      buttons: [
        {
          type: 'OTP',
          otp_type: 'COPY_CODE',
          ...(otp && 'text' in otp && otp.text ? { text: otp.text } : {}),
        },
      ],
    })
    return components
  }

  const headerType = (tpl.headerType ?? null) as TemplateHeaderType | null
  if (headerType === 'TEXT' && tpl.headerText) {
    const hasVar = extractPlaceholders(tpl.headerText).length > 0
    components.push({
      type: 'HEADER',
      format: 'TEXT',
      text: tpl.headerText,
      ...(hasVar ? { example: { header_text: [tpl.headerTextExample ?? ''] } } : {}),
    })
  } else if (headerType && headerType !== 'TEXT' && tpl.headerMediaHandle) {
    components.push({
      type: 'HEADER',
      format: headerType,
      example: { header_handle: [tpl.headerMediaHandle] },
    })
  }

  const bodyVars = extractPlaceholders(tpl.bodyText)
  const n = bodyVars.length ? Math.max(...bodyVars) : 0
  components.push({
    type: 'BODY',
    text: tpl.bodyText,
    ...(n > 0 ? { example: { body_text: [(tpl.bodyExamples ?? []).slice(0, n)] } } : {}),
  })

  if (tpl.footerText?.trim()) components.push({ type: 'FOOTER', text: tpl.footerText })

  const buttons = buildButtonsComponent(tpl)
  if (buttons) components.push(buttons)
  return components
}

export function buildCreateTemplatePayload(tpl: TemplateLike): Record<string, unknown> {
  return {
    name: tpl.name,
    language: tpl.language,
    category: tpl.category,
    // Biarkan Meta mengoreksi kategori daripada menolak — kategori final
    // tetap disinkronkan lewat webhook/sync (memengaruhi harga).
    allow_category_change: true,
    components: buildTemplateComponents(tpl),
  }
}

export function buildEditTemplatePayload(
  tpl: TemplateLike,
  opts: { includeCategory?: boolean } = {},
): Record<string, unknown> {
  return {
    ...(opts.includeCategory ? { category: tpl.category } : {}),
    components: buildTemplateComponents(tpl),
  }
}

// ── Send ──

export class TemplateParamError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TemplateParamError'
  }
}

/** Jumlah variabel body yang diharapkan template. */
export function expectedBodyParamCount(tpl: TemplateLike): number {
  if (tpl.category === 'AUTHENTICATION') return 1
  const nums = extractPlaceholders(tpl.bodyText)
  return nums.length ? Math.max(...nums) : 0
}

/**
 * Susun `components` untuk POST /{phoneNumberId}/messages type template.
 * Throw TemplateParamError bila jumlah/jenis param tidak cocok (cegah 132000).
 */
export function buildSendComponents(tpl: TemplateLike, params: TemplateSendParams): unknown[] {
  const components: unknown[] = []
  const body = (params.body ?? []).map(flattenParamValue)

  if (tpl.category === 'AUTHENTICATION') {
    const code = body[0]
    if (!code) throw new TemplateParamError('Kode OTP wajib diisi sebagai parameter body pertama')
    components.push({ type: 'body', parameters: [{ type: 'text', text: code }] })
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: code }],
    })
    return components
  }

  const headerType = (tpl.headerType ?? null) as TemplateHeaderType | null
  if (headerType === 'TEXT' && extractPlaceholders(tpl.headerText).length > 0) {
    const v = params.header?.type === 'text' ? flattenParamValue(params.header.value) : ''
    if (!v) throw new TemplateParamError('Parameter header {{1}} wajib diisi')
    components.push({ type: 'header', parameters: [{ type: 'text', text: v }] })
  } else if (headerType && headerType !== 'TEXT') {
    const link = params.header && params.header.type !== 'text' ? params.header.value : tpl.headerMediaUrl
    if (!link) throw new TemplateParamError(`Header ${headerType} butuh URL media publik`)
    // headerMediaUrl hasil sync dari Meta = URL CDN contoh (lookaside/scontent)
    // yang BERUMUR PENDEK — dipakai kirim akan gagal diunduh Meta setelah
    // kedaluwarsa (wamid tetap keluar → kredit terpotong, pesan failed).
    if (!params.header && /(^|\.)(lookaside\.fbsbx\.com|fbcdn\.net|scontent[.-])/i.test(link)) {
      throw new TemplateParamError(
        `Header ${headerType} template ini memakai URL contoh Meta yang kedaluwarsa — ` +
          'sertakan URL media publik saat kirim, atau unggah ulang media di editor template',
      )
    }
    const kind = headerType.toLowerCase() as 'image' | 'video' | 'document'
    const media: Record<string, unknown> = { link }
    if (kind === 'document' && params.header?.filename) media.filename = params.header.filename
    components.push({ type: 'header', parameters: [{ type: kind, [kind]: media }] })
  }

  const expected = expectedBodyParamCount(tpl)
  if (expected > 0) {
    if (body.length < expected || body.slice(0, expected).some((v) => !v)) {
      throw new TemplateParamError(
        `Template "${tpl.name}" butuh ${expected} parameter body, diberikan ${body.filter(Boolean).length}`,
      )
    }
    components.push({
      type: 'body',
      parameters: body.slice(0, expected).map((text) => ({ type: 'text', text })),
    })
  }

  const tplButtons = readTemplateButtons(tpl.buttons)
  const given = new Map((params.buttons ?? []).map((b) => [b.index, b]))
  tplButtons.forEach((b, index) => {
    if (b.type === 'URL' && extractPlaceholders(b.url).length > 0) {
      const p = given.get(index)
      if (!p?.value) throw new TemplateParamError(`Tombol URL #${index + 1} butuh nilai sufiks`)
      components.push({
        type: 'button',
        sub_type: 'url',
        index: String(index),
        parameters: [{ type: 'text', text: flattenParamValue(p.value) }],
      })
    } else if (b.type === 'COPY_CODE') {
      const p = given.get(index)
      if (!p?.value) throw new TemplateParamError(`Tombol salin kode #${index + 1} butuh nilai kode`)
      components.push({
        type: 'button',
        sub_type: 'copy_code',
        index: String(index),
        parameters: [{ type: 'coupon_code', coupon_code: flattenParamValue(p.value) }],
      })
    } else if (b.type === 'QUICK_REPLY') {
      const p = given.get(index)
      if (p?.value) {
        components.push({
          type: 'button',
          sub_type: 'quick_reply',
          index: String(index),
          parameters: [{ type: 'payload', payload: flattenParamValue(p.value) }],
        })
      }
    }
  })

  return components
}

// ── Render teks (preview & Message.content) ──

/** Teks yang kira-kira diterima customer — untuk preview & isi Message. */
export function renderTemplateText(tpl: TemplateLike, params?: Partial<TemplateSendParams>): string {
  const body = (params?.body ?? tpl.bodyExamples ?? []).map((v) => flattenParamValue(v))
  const lines: string[] = []

  if (tpl.category === 'AUTHENTICATION') {
    const code = body[0] || '123456'
    lines.push(`${code} adalah kode verifikasi Anda.`)
    if (tpl.authAddSecurityRecommendation ?? true) {
      lines.push('Demi keamanan, jangan bagikan kode ini.')
    }
    if (tpl.authCodeExpirationMinutes) {
      lines.push(`Kode ini berlaku ${tpl.authCodeExpirationMinutes} menit.`)
    }
    return lines.join('\n')
  }

  const headerType = tpl.headerType ?? null
  if (headerType === 'TEXT' && tpl.headerText) {
    const hv = params?.header?.type === 'text' ? params.header.value : tpl.headerTextExample ?? ''
    lines.push(substitute(tpl.headerText, [flattenParamValue(hv)]))
  } else if (headerType && headerType !== 'TEXT') {
    const label = headerType === 'IMAGE' ? 'Gambar' : headerType === 'VIDEO' ? 'Video' : 'Dokumen'
    lines.push(`[${label}]`)
  }

  lines.push(substitute(tpl.bodyText, body))
  if (tpl.footerText?.trim()) lines.push(tpl.footerText)

  const buttons = readTemplateButtons(tpl.buttons)
  const given = new Map((params?.buttons ?? []).map((b) => [b.index, b]))
  buttons.forEach((b, index) => {
    if (b.type === 'URL') {
      const suffix = given.get(index)?.value ?? b.example ?? ''
      lines.push(`[${b.text}] ${substitute(b.url, [flattenParamValue(suffix)])}`)
    } else if (b.type === 'QUICK_REPLY') lines.push(`[${b.text}]`)
    else if (b.type === 'PHONE_NUMBER') lines.push(`[${b.text}] ${b.phone_number}`)
    else if (b.type === 'COPY_CODE') lines.push(`[Salin kode] ${given.get(index)?.value ?? b.example}`)
  })
  return lines.join('\n')
}

// ── Parse komponen Meta → kolom (untuk sync template yang dibuat di luar hulao) ──

export interface ParsedTemplateColumns {
  headerType: string | null
  headerText: string | null
  headerTextExample: string | null
  headerMediaUrl: string | null
  bodyText: string
  bodyExamples: string[]
  footerText: string | null
  buttons: WabaTemplateButton[] | null
  authAddSecurityRecommendation: boolean
  authCodeExpirationMinutes: number | null
}

interface MetaComponent {
  type?: string
  format?: string
  text?: string
  example?: {
    header_text?: string[]
    header_handle?: string[]
    body_text?: string[][]
  }
  add_security_recommendation?: boolean
  code_expiration_minutes?: number
  buttons?: Array<Record<string, unknown>>
}

export function parseMetaComponents(raw: unknown): ParsedTemplateColumns {
  const out: ParsedTemplateColumns = {
    headerType: null,
    headerText: null,
    headerTextExample: null,
    headerMediaUrl: null,
    bodyText: '',
    bodyExamples: [],
    footerText: null,
    buttons: null,
    authAddSecurityRecommendation: true,
    authCodeExpirationMinutes: null,
  }
  if (!Array.isArray(raw)) return out
  for (const c of raw as MetaComponent[]) {
    const type = (c.type ?? '').toUpperCase()
    if (type === 'HEADER') {
      const format = (c.format ?? 'TEXT').toUpperCase()
      out.headerType = format
      if (format === 'TEXT') {
        out.headerText = c.text ?? null
        out.headerTextExample = c.example?.header_text?.[0] ?? null
      } else {
        // Meta mengembalikan URL contoh media (kadaluarsa) — simpan untuk preview.
        out.headerMediaUrl = c.example?.header_handle?.[0] ?? null
      }
    } else if (type === 'BODY') {
      out.bodyText = c.text ?? ''
      out.bodyExamples = c.example?.body_text?.[0] ?? []
      if (typeof c.add_security_recommendation === 'boolean') {
        out.authAddSecurityRecommendation = c.add_security_recommendation
      }
    } else if (type === 'FOOTER') {
      out.footerText = c.text ?? null
      if (typeof c.code_expiration_minutes === 'number') {
        out.authCodeExpirationMinutes = c.code_expiration_minutes
      }
    } else if (type === 'BUTTONS' && Array.isArray(c.buttons)) {
      out.buttons = c.buttons
        .map((b): WabaTemplateButton | null => {
          const t = String(b.type ?? '').toUpperCase()
          if (t === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text: String(b.text ?? '') }
          if (t === 'URL') {
            const url = String(b.url ?? '')
            // Meta menyimpan contoh sebagai URL LENGKAP; kolom hulao menyimpan
            // sufiksnya saja → buang prefix sebelum {{1}}.
            const full = Array.isArray(b.example) ? String(b.example[0] ?? '') : ''
            const prefix = url.split(/\{\{\s*1\s*\}\}/)[0] ?? ''
            const ex = full && prefix && full.startsWith(prefix) ? full.slice(prefix.length) : full || undefined
            return { type: 'URL', text: String(b.text ?? ''), url, ...(ex ? { example: ex } : {}) }
          }
          if (t === 'PHONE_NUMBER') {
            return { type: 'PHONE_NUMBER', text: String(b.text ?? ''), phone_number: String(b.phone_number ?? '') }
          }
          if (t === 'COPY_CODE') return { type: 'COPY_CODE', example: String(b.example ?? '') }
          if (t === 'OTP') return { type: 'OTP', otp_type: 'COPY_CODE', ...(b.text ? { text: String(b.text) } : {}) }
          return null
        })
        .filter((b): b is WabaTemplateButton => b !== null)
    }
  }
  return out
}
