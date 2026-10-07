// Helper PURE header media template Meta (IMAGE/VIDEO/DOCUMENT).
//
// Latar (bug produksi 2026-10): Meta mengembalikan contoh header media sebagai
// URL CDN miliknya sendiri (scontent.whatsapp.net / *.fbcdn.net /
// lookaside.fbsbx.com). Pengunduh media Meta MENOLAK URL CDN-nya sendiri saat
// kirim (131053 "Downloading media from weblink failed with http code 403"),
// walau URL itu masih bisa diunduh dari server kita. Jadi:
//   - sync template tidak boleh menimpa URL publik hulao dengan URL CDN Meta;
//   - URL CDN Meta tidak boleh dikirim sebagai `link` — harus diunduh lalu
//     di-upload ke /{phoneNumberId}/media dan dikirim via `id`.

/** Batas resmi contoh header template (dipakai juga oleh template-media.ts). */
export const TEMPLATE_MEDIA_LIMITS = {
  IMAGE: { maxBytes: 5 * 1024 * 1024, mimes: ['image/jpeg', 'image/png'] },
  VIDEO: { maxBytes: 16 * 1024 * 1024, mimes: ['video/mp4'] },
  DOCUMENT: { maxBytes: 100 * 1024 * 1024, mimes: ['application/pdf'] },
} as const

export type HeaderMediaKind = 'image' | 'video' | 'document'

export interface HeaderMediaRule {
  mimes: readonly string[]
  maxBytes: number
  /** Label Bahasa Indonesia untuk pesan ke seller. */
  label: string
}

// DOCUMENT dibatasi 25MB (bukan 100MB Meta): saat kirim, file diunduh dari
// CDN Meta lalu di-upload ulang dan SELURUH buffer ditahan di memori proses —
// VPS sudah kronis overcommit (lihat insiden OOM). PDF contoh header template
// lazimnya jauh di bawah ini; yang lebih besar ditolak dengan pesan jelas.
const DOCUMENT_IN_MEMORY_MAX_BYTES = 25 * 1024 * 1024

const RULES: Record<HeaderMediaKind, HeaderMediaRule> = {
  image: { ...TEMPLATE_MEDIA_LIMITS.IMAGE, label: 'Gambar' },
  video: { ...TEMPLATE_MEDIA_LIMITS.VIDEO, label: 'Video' },
  document: {
    mimes: TEMPLATE_MEDIA_LIMITS.DOCUMENT.mimes,
    maxBytes: Math.min(TEMPLATE_MEDIA_LIMITS.DOCUMENT.maxBytes, DOCUMENT_IN_MEMORY_MAX_BYTES),
    label: 'Dokumen',
  },
}

// Domain CDN milik Meta — dicocokkan per HOSTNAME (sama persis atau
// subdomain), bukan substring URL, supaya `whatsapp.net.evil.com` tidak lolos.
const META_CDN_DOMAINS = ['fbcdn.net', 'fbsbx.com', 'whatsapp.net'] as const

/** True bila URL (http/https) menunjuk host CDN Meta. Input tidak valid → false. */
export function isMetaCdnUrl(url: string | null | undefined): boolean {
  if (!url) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
  const host = parsed.hostname.toLowerCase()
  return META_CDN_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))
}

/**
 * Nilai headerMediaUrl setelah sync dari Meta. URL publik hulao (hasil upload
 * editor) DIPERTAHANKAN — itu satu-satunya link yang bisa diunduh Meta saat
 * kirim. Selain itu ikut URL contoh terbaru dari Meta (untuk preview).
 */
export function chooseSyncedHeaderMediaUrl(
  existing: string | null | undefined,
  fromMeta: string | null | undefined,
): string | null {
  const current = existing?.trim() ? existing : null
  if (current && !isMetaCdnUrl(current)) return current
  return fromMeta || current
}

/** Jenis parameter kirim untuk headerType template; header non-media → null. */
export function mediaKindForHeader(headerType: string | null | undefined): HeaderMediaKind | null {
  const t = (headerType ?? '').toUpperCase()
  if (t === 'IMAGE') return 'image'
  if (t === 'VIDEO') return 'video'
  if (t === 'DOCUMENT') return 'document'
  return null
}

export function headerMediaRule(kind: HeaderMediaKind): HeaderMediaRule {
  return RULES[kind]
}

function normalizeMime(contentType: string | null | undefined): string {
  return (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
}

/** Tebak MIME dari magic bytes — hanya format yang didukung header template. */
function sniffMime(bytes: Uint8Array): string | null {
  const b = bytes
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf'
  if (b.length >= 8 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'video/mp4'
  return null
}

/**
 * MIME final untuk upload ke Meta: content-type respons bila diizinkan untuk
 * jenis header ini; bila tidak, tebak dari magic bytes (CDN kadang membalas
 * `application/octet-stream`). Tidak cocok jenis header → null.
 */
export function resolveHeaderMediaMime(
  kind: HeaderMediaKind,
  contentType: string | null | undefined,
  bytes: Uint8Array,
): string | null {
  const allowed = RULES[kind].mimes
  const declared = normalizeMime(contentType)
  if (allowed.includes(declared)) return declared
  const sniffed = sniffMime(bytes)
  return sniffed && allowed.includes(sniffed) ? sniffed : null
}

/** Pesan ramah untuk seller bila media header template tidak bisa disiapkan. */
export function headerMediaUnavailableMessage(kind: HeaderMediaKind): string {
  const label = RULES[kind].label
  const noun = label.toLowerCase()
  return (
    `${label} header template tidak bisa diambil dari Meta — ` +
    `unggah ulang ${noun} di menu Template Meta lalu ajukan ulang`
  )
}

/**
 * Pesan untuk gagal SEMENTARA (timeout/jaringan/5xx Meta) — media template
 * tidak rusak, cukup dicoba lagi. Jangan suruh seller unggah ulang.
 */
export function headerMediaTemporaryMessage(kind: HeaderMediaKind): string {
  return (
    `${RULES[kind].label} header template gagal disiapkan karena gangguan sementara ` +
    `(Meta/jaringan) — coba lagi beberapa saat lagi`
  )
}

// ── Klasifikasi gagal sementara vs permanen ──
// Sementara → follow-up di-retry otomatis & broadcast di-PAUSE (lanjutkan
// manual); permanen → TEMPLATE_PARAM_MISMATCH (seller harus memperbaiki
// template). Salah klasifikasi = follow-up hilang saat Meta sekadar gangguan.

/** Status HTTP unduhan: tanpa status (timeout/jaringan), 408, 429, 5xx = sementara. */
export function isTransientHttpStatus(status: number | undefined): boolean {
  if (status === undefined) return true
  return status === 408 || status === 429 || status >= 500
}

// Kode error Meta yang bersifat sementara walau HTTP-nya 400:
// 1 unknown, 2 service unavailable, 4/17/32/613/80007/130429 rate limit.
const TRANSIENT_GRAPH_CODES = new Set([1, 2, 4, 17, 32, 613, 80007, 130429])

/** Error Graph API (MetaApiError) yang layak dicoba lagi. */
export function isTransientGraphError(err: { code?: number; httpStatus?: number; message?: string }): boolean {
  if (err.code !== undefined && TRANSIENT_GRAPH_CODES.has(err.code)) return true
  return isTransientHttpStatus(err.httpStatus)
}

/** Kode gagal sendCloudTemplate untuk kegagalan menyiapkan media header. */
export function headerMediaFailureSendCode(
  transient: boolean,
): 'HEADER_MEDIA_TEMPORARY' | 'TEMPLATE_PARAM_MISMATCH' {
  return transient ? 'HEADER_MEDIA_TEMPORARY' : 'TEMPLATE_PARAM_MISMATCH'
}
