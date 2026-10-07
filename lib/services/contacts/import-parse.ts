// Parser & normalisasi impor kontak dari spreadsheet (CSV upload atau teks
// yang ditempel dari Google Sheets/Excel). MURNI — tanpa prisma/IO supaya bisa
// diuji langsung (lihat import-parse.test.ts) dan dipakai ulang di klien.
//
// Format simpan nomor = digit murni ('628…'), sama dengan Contact.phoneNumber
// hasil pipeline CS — supaya balasan pelanggan menemukan kontak yang sama.

import { normalizePhone, toWaNumber } from '@/lib/phone'

export interface ParsedContactRow {
  /** Nomor baris fisik (1-based) di teks sumber — untuk pesan error. */
  line: number
  name: string | null
  phoneRaw: string
}

export interface ParsedContactTable {
  rows: ParsedContactRow[]
  hasHeader: boolean
  phoneColumn: number
  nameColumn: number | null
}

export type NormalizedPhoneResult =
  | { ok: true; phone: string }
  | { ok: false; reason: string }

export interface ImportPlan {
  valid: { phone: string; name: string | null }[]
  invalid: { line: number; raw: string; reason: string }[]
  duplicatesInFile: number
  truncated: boolean
  totalRows: number
}

export const DEFAULT_IMPORT_MAX_ROWS = 10_000
// Selaras contactUpdateSchema (nama ≤80, tag ≤30) — kalau lebih panjang,
// edit kontak hasil impor di dashboard akan ditolak validasi.
const NAME_MAX = 80
const TAG_MAX = 30
const DETECT_SAMPLE_ROWS = 50
const INTL_MIN_DIGITS = 10
const INTL_MAX_DIGITS = 15

const NAME_HEADER_RE = /nama|name|customer|pelanggan/i
const PHONE_HEADER_RE =
  /nomor|no\.? ?(hp|wa|telp|telepon)|phone|handphone|whatsapp|\bwa\b|\bhp\b|telepon|telp/i
// Excel menampilkan angka panjang sebagai 6.28123E+12 — digit aslinya hilang.
const SCIENTIFIC_RE = /^\d+([.,]\d+)?e\+?\d+$/i
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F-\u009F]/g

type Delimiter = '\t' | ',' | ';'

// ─── Nomor & nama ─────────────────────────────────────────────────────────

/** Normalisasi satu sel nomor ke digit murni, atau alasan penolakan. */
export function normalizeImportPhone(raw: string): NormalizedPhoneResult {
  const trimmed = raw.trim().replace(/^['‘’]+/, '').trim()
  if (!trimmed) return { ok: false, reason: 'nomor kosong' }
  if (SCIENTIFIC_RE.test(trimmed)) {
    return { ok: false, reason: 'format angka Excel — ubah kolom nomor jadi Teks' }
  }

  const cleaned = trimmed.replace(/[\s \-.()]/g, '')
  if (!cleaned) return { ok: false, reason: 'nomor kosong' }
  if (!/^\+?\d+$/.test(cleaned)) {
    return { ok: false, reason: 'nomor mengandung karakter tidak valid' }
  }

  // Prefiks internasional '00' setara dengan '+'.
  const hasPlus = cleaned.startsWith('+') || cleaned.startsWith('00')
  const digits = cleaned.startsWith('+')
    ? cleaned.slice(1)
    : cleaned.startsWith('00')
      ? cleaned.slice(2)
      : cleaned

  const looksIndonesian = hasPlus ? digits.startsWith('62') : /^(0|8|62)/.test(digits)
  if (looksIndonesian) {
    const e164 = normalizePhone(hasPlus ? `+${digits}` : digits)
    const phone = toWaNumber(e164)
    return phone ? { ok: true, phone } : { ok: false, reason: 'nomor Indonesia tidak valid' }
  }

  if (!hasPlus) {
    return { ok: false, reason: 'nomor luar negeri wajib diawali +kode negara' }
  }
  if (digits.startsWith('0') || digits.length < INTL_MIN_DIGITS || digits.length > INTL_MAX_DIGITS) {
    return { ok: false, reason: 'nomor luar negeri harus 10–15 digit termasuk kode negara' }
  }
  return { ok: true, phone: digits }
}

/** Rapikan nama: buang control char, rapatkan spasi, maks 80 karakter. */
export function sanitizeImportName(raw: string | null | undefined): string | null {
  if (!raw) return null
  const clean = raw.replace(CONTROL_CHARS_RE, ' ').replace(/\s+/g, ' ').trim()
  const cut = clean.slice(0, NAME_MAX).trim()
  return cut || null
}

// ─── Parser tabel ─────────────────────────────────────────────────────────

/** Hitung delimiter di luar tanda kutip pada satu baris. */
function countOutsideQuotes(line: string, ch: string): number {
  let inQuotes = false
  let n = 0
  for (const c of line) {
    if (c === '"') inQuotes = !inQuotes
    else if (!inQuotes && c === ch) n += 1
  }
  return n
}

function detectDelimiter(text: string): Delimiter {
  const first = text.split('\n').find((l) => l.trim() !== '') ?? ''
  if (countOutsideQuotes(first, '\t') > 0) return '\t'
  const semi = countOutsideQuotes(first, ';')
  const comma = countOutsideQuotes(first, ',')
  // Seri → titik-koma: koma lebih mungkin muncul di isi (mis. "Budi, S.Kom").
  return semi > 0 && semi >= comma ? ';' : ','
}

interface RawRecord {
  line: number
  cells: string[]
}

/** Parser CSV ala RFC 4180: field berkutip boleh memuat delimiter & newline. */
function parseRecords(text: string, delimiter: Delimiter): RawRecord[] {
  const records: RawRecord[] = []
  let cells: string[] = []
  let field = ''
  let inQuotes = false
  let line = 1
  let recordLine = 1

  const endRecord = () => {
    records.push({ line: recordLine, cells: [...cells, field] })
    cells = []
    field = ''
  }

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i += 1
      } else if (c === '"') {
        inQuotes = false
      } else {
        if (c === '\n') line += 1
        field += c
      }
      continue
    }
    if (c === '"' && field.trim() === '') {
      field = ''
      inQuotes = true
    } else if (c === delimiter) {
      cells.push(field)
      field = ''
    } else if (c === '\n') {
      endRecord()
      line += 1
      recordLine = line
    } else {
      field += c
    }
  }
  if (field !== '' || cells.length > 0) endRecord()

  return records
    .map((r) => ({ line: r.line, cells: r.cells.map((x) => x.trim()) }))
    .filter((r) => r.cells.some((x) => x !== ''))
}

function isValidPhoneCell(cell: string | undefined): boolean {
  return cell !== undefined && normalizeImportPhone(cell).ok
}

function detectHeader(first: RawRecord | undefined): {
  hasHeader: boolean
  phoneColumn: number | null
  nameColumn: number | null
} {
  if (!first) return { hasHeader: false, phoneColumn: null, nameColumn: null }
  const looksLikeHeader =
    first.cells.some((c) => NAME_HEADER_RE.test(c) || PHONE_HEADER_RE.test(c)) &&
    !first.cells.some(isValidPhoneCell)
  if (!looksLikeHeader) return { hasHeader: false, phoneColumn: null, nameColumn: null }

  const phoneIdx = first.cells.findIndex((c) => PHONE_HEADER_RE.test(c))
  const nameIdx = first.cells.findIndex((c, i) => i !== phoneIdx && NAME_HEADER_RE.test(c))
  return {
    hasHeader: true,
    phoneColumn: phoneIdx >= 0 ? phoneIdx : null,
    nameColumn: nameIdx >= 0 ? nameIdx : null,
  }
}

/** Kolom dengan nomor valid terbanyak di sampel; seri → indeks terkecil. */
function detectPhoneColumn(sample: RawRecord[]): number {
  const width = Math.max(1, ...sample.map((r) => r.cells.length))
  let best = 0
  let bestScore = -1
  for (let col = 0; col < width; col += 1) {
    const score = sample.filter((r) => isValidPhoneCell(r.cells[col])).length
    if (score > bestScore) {
      best = col
      bestScore = score
    }
  }
  return best
}

/** Kolom teks non-nomor pertama (selain kolom nomor) yang berisi huruf. */
function detectNameColumn(sample: RawRecord[], phoneColumn: number): number | null {
  const width = Math.max(0, ...sample.map((r) => r.cells.length))
  for (let col = 0; col < width; col += 1) {
    if (col === phoneColumn) continue
    const hasText = sample.some((r) => {
      const cell = r.cells[col] ?? ''
      return /\p{L}/u.test(cell) && !isValidPhoneCell(cell)
    })
    if (hasText) return col
  }
  return null
}

/** Parse teks CSV/TSV menjadi baris {nama, nomor mentah} + info kolom. */
export function parseContactTable(text: string): ParsedContactTable {
  const normalized = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const records = parseRecords(normalized, detectDelimiter(normalized))
  const header = detectHeader(records[0])
  const dataRecords = header.hasHeader ? records.slice(1) : records
  const sample = dataRecords.slice(0, DETECT_SAMPLE_ROWS)

  const phoneColumn = header.phoneColumn ?? detectPhoneColumn(sample)
  const nameColumn =
    header.nameColumn !== null && header.nameColumn !== phoneColumn
      ? header.nameColumn
      : detectNameColumn(sample, phoneColumn)

  const rows = dataRecords.map((r) => {
    const name = nameColumn === null ? '' : (r.cells[nameColumn] ?? '')
    return { line: r.line, name: name || null, phoneRaw: r.cells[phoneColumn] ?? '' }
  })

  return { rows, hasHeader: header.hasHeader, phoneColumn, nameColumn }
}

// ─── Rencana impor ────────────────────────────────────────────────────────

/**
 * Validasi + dedupe baris. Nomor duplikat dalam file dihitung; nama yang
 * dipakai = nama non-kosong pertama untuk nomor itu.
 */
export function buildImportPlan(
  rows: ParsedContactRow[],
  opts: { maxRows?: number } = {},
): ImportPlan {
  const maxRows = opts.maxRows ?? DEFAULT_IMPORT_MAX_ROWS
  const taken = rows.slice(0, maxRows)
  const byPhone = new Map<string, { phone: string; name: string | null }>()
  const invalid: ImportPlan['invalid'] = []
  let duplicatesInFile = 0

  for (const row of taken) {
    const result = normalizeImportPhone(row.phoneRaw)
    if (!result.ok) {
      invalid.push({ line: row.line, raw: row.phoneRaw, reason: result.reason })
      continue
    }
    const name = sanitizeImportName(row.name)
    const prev = byPhone.get(result.phone)
    if (prev) {
      duplicatesInFile += 1
      if (!prev.name && name) byPhone.set(result.phone, { ...prev, name })
      continue
    }
    byPhone.set(result.phone, { phone: result.phone, name })
  }

  return {
    valid: [...byPhone.values()],
    invalid,
    duplicatesInFile,
    truncated: rows.length > maxRows,
    totalRows: rows.length,
  }
}

// ─── Tag & util ───────────────────────────────────────────────────────────

/** Slug tag impor; kosong → 'impor-YYYYMMDD' (todayYmd di-pass pemanggil). */
export function normalizeImportTag(input: string | null | undefined, todayYmd: string): string {
  const slug = (input ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_:]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, TAG_MAX)
    .replace(/-+$/g, '')
  return slug || `impor-${todayYmd}`
}

/** Tanggal 'YYYYMMDD' menurut WIB (Asia/Jakarta). */
export function ymdInJakarta(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
  return parts.replace(/-/g, '')
}

/** Samarkan nomor untuk pratinjau: '6281234567890' → '62812****7890'. */
export function maskImportPhone(phone: string): string {
  if (phone.length < 9) return '***'
  return `${phone.slice(0, 5)}****${phone.slice(-4)}`
}

// ─── Gabung dengan kontak lama ────────────────────────────────────────────

export interface ExistingContactSnapshot {
  id: string
  phoneNumber: string
  name: string | null
  tags: string[]
}

export interface ExistingContactUpdatePlan {
  /** Kontak lama yang belum punya tag impor → tag ditambahkan. */
  needTagIds: string[]
  /** Kontak lama bernama kosong yang punya nama di file → nama diisi. */
  nameFills: { id: string; name: string }[]
  /** Jumlah kontak lama yang berubah (tag ditambah dan/atau nama diisi). */
  updatedExisting: number
  /** Kontak lama yang sudah bertag & tidak berubah sama sekali. */
  alreadyTagged: number
}

/**
 * Tentukan perubahan untuk kontak yang SUDAH ada di sesi tujuan. Hanya tag
 * & nama kosong yang disentuh — stage/blacklist/opt-out/nama editan CS tetap.
 */
export function planExistingContactUpdates(
  existing: ExistingContactSnapshot[],
  incomingNames: Map<string, string | null>,
  tag: string,
): ExistingContactUpdatePlan {
  const needTagIds: string[] = []
  const nameFills: { id: string; name: string }[] = []
  let updatedExisting = 0
  let alreadyTagged = 0

  for (const c of existing) {
    const needsTag = !c.tags.includes(tag)
    const incoming = incomingNames.get(c.phoneNumber) ?? null
    const fillName = !c.name?.trim() && incoming ? incoming : null
    if (needsTag) needTagIds.push(c.id)
    if (fillName) nameFills.push({ id: c.id, name: fillName })
    if (needsTag || fillName) updatedExisting += 1
    else alreadyTagged += 1
  }

  return { needTagIds, nameFills, updatedExisting, alreadyTagged }
}
