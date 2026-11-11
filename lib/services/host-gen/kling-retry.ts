// Klasifikasi error task Kling: transient (layak auto-retry) vs permanen.
//
// Kling kadang menggagalkan task dengan pesan transient dari sisi server
// mereka — paling sering "generation time out". Task seperti ini hampir
// selalu sukses saat di-submit ulang, jadi poller/orchestrator kita
// resubmit otomatis (bounded) sebelum benar-benar menandai FAILED ke user.
//
// PENTING: error TRANSPORT saat poll (HTTP non-2xx, body bukan JSON,
// envelope code!=0) TIDAK boleh di-retry — task aslinya mungkin masih
// hidup di server Kling; resubmit berarti dobel task + dobel biaya.
// Prefix error transport dihasilkan pollKlingStatus/pollKlingLipsync di
// kling.ts: "HTTP <status>: …", "Non-JSON: …", "code=<n> …".

const TRANSIENT_RE =
  /time ?-?out|internal error|server error|service (busy|unavailable)|system error|try again/i

const TRANSPORT_PREFIX_RE = /^(HTTP \d|Non-JSON:|code=)/

// Maks resubmit otomatis per job (di luar submit pertama).
export const MAX_KLING_AUTO_RETRIES = 2

export function isTransientKlingTaskFailure(
  rawError: string | null | undefined,
): boolean {
  if (!rawError) return false
  if (TRANSPORT_PREFIX_RE.test(rawError)) return false
  return TRANSIENT_RE.test(rawError)
}

// ── Klasifikasi gagal SUBMIT task (2026-11-11) ───────────────────────────
// Kode error resmi Kling (docs "Error Code"):
//   401 · 1000–1004  auth gagal / API key rusak / kedaluwarsa
//   429 · 1100–1103  masalah AKUN: 1101 tunggakan, 1102 resource pack habis
//                    ("Account balance not enough"), 1103 tanpa izin
//   429 · 1302       request terlalu cepat (rate limit)
//   429 · 1303       task paralel melebihi batas resource pack
//   429 · 1304       kebijakan IP whitelist
// Insiden 2026-11-11: saldo Kling habis (1102) tapi kode lama menganggap
// SEMUA 429 = antrian penuh → retry 150 dtk → route sinkron kena 524
// Cloudflare → seller lihat "Unexpected token '<'" dan klik ulang 31×.
// Hanya 1302/1303 yang layak ditunggu; masalah akun wajib gagal cepat.

export type KlingSubmitFailureKind = 'queue' | 'account' | 'other'

const KLING_ACCOUNT_CODES = new Set([
  1000, 1001, 1002, 1003, 1004, 1100, 1101, 1102, 1103, 1304,
])

function parseKlingErrorCode(bodyText: string): number | null {
  try {
    const parsed = JSON.parse(bodyText) as { code?: unknown }
    return typeof parsed.code === 'number' ? parsed.code : null
  } catch {
    return null
  }
}

export function classifyKlingSubmitFailure(
  httpStatus: number,
  bodyText: string,
): { kind: KlingSubmitFailureKind; code: number | null } {
  const code = parseKlingErrorCode(bodyText)
  if (code !== null && KLING_ACCOUNT_CODES.has(code)) {
    return { kind: 'account', code }
  }
  // 429 tanpa kode akun (1302/1303, kode baru, atau body bukan JSON) →
  // perlakuan lama: antrian penuh, layak ditunggu.
  if (httpStatus === 429) return { kind: 'queue', code }
  return { kind: 'other', code }
}

// Pesan aman untuk seller — sengaja tanpa detail provider (kode, saldo,
// JSON mentah). Detail lengkap dicatat ke log server oleh pemanggil.
// JANGAN klaim "token tidak terpotong": jalur klip lipsync sudah memotong
// token TTS sebelum submit Kling, jadi klaim itu salah di sana.
export const KLING_ACCOUNT_UNAVAILABLE_MSG =
  'Layanan pembuat video AI sedang tidak tersedia dari sisi penyedia — tim kami sedang menanganinya. Coba lagi beberapa saat lagi.'

export class KlingAccountError extends Error {
  readonly code: number | null

  constructor(code: number | null) {
    super(KLING_ACCOUNT_UNAVAILABLE_MSG)
    this.name = 'KlingAccountError'
    this.code = code
  }
}

// ── Memo gangguan akun (circuit breaker in-process) ─────────────────────
// Selama akun Kling bermasalah, setiap percobaan pasti gagal — tapi jalur
// klip lipsync sudah memotong token TTS sebelum submit Kling. Memo ini
// dipakai route start (baseline/klip) untuk menolak di depan, sebelum ada
// biaya. Satu proses Next (self-hosted), jadi state modul cukup. TTL pendek
// supaya tidak lama mengunci setelah owner top-up; submit sukses langsung
// menghapusnya.
export const KLING_ACCOUNT_OUTAGE_TTL_MS = 5 * 60_000

let accountOutage: {
  code: number | null
  since: number
  lastAt: number
} | null = null

export function noteKlingAccountFailure(
  code: number | null,
  now: number,
): void {
  const active = getKlingAccountOutage(now)
  accountOutage = { code, since: active?.since ?? now, lastAt: now }
}

export function getKlingAccountOutage(
  now: number,
): { code: number | null; since: number } | null {
  if (!accountOutage) return null
  if (now - accountOutage.lastAt > KLING_ACCOUNT_OUTAGE_TTL_MS) return null
  return { code: accountOutage.code, since: accountOutage.since }
}

export function clearKlingAccountOutage(): void {
  accountOutage = null
}
