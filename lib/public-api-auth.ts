// Gerbang satu-satunya untuk /api/v1/* (API publik seller).
//
// PENTING: middleware.ts hanya mencakup /dashboard, /admin, /onboarding —
// route /api/v1/* TIDAK punya jaring pengaman apa pun. `requirePublicApiAuth`
// wajib jadi baris pertama setiap handler v1. Jadikan ini poin checklist
// review tiap kali menambah endpoint baru.
//
// Keterbatasan rate limiter: in-memory per proses (lib/rate-limit-memory.ts).
// Reset saat deploy/restart — klien dapat jatah ekstra sesaat, bukan lockout;
// bila di-scale ke banyak replika, limit efektif = limit × jumlah replika.
// Deployment saat ini single-instance dan Cloudflare tetap lapis pertama.
// Pola DB-backed kalau nanti perlu: lib/otp/auth-otp.ts.

import { NextResponse } from 'next/server'
import { getClientIp } from '@/lib/client-ip'
import { checkRateLimit, consumeRateLimit, recordRateLimitHit } from '@/lib/rate-limit-memory'
import { touchApiKeyUsage, verifySellerApiKey } from '@/lib/services/seller-api-keys'

export const API_VERSION = 'v1'

/** Kuota per kunci. Diumumkan di tab "Batas & Kuota" halaman /pengembang/api. */
export const RATE_LIMIT_PER_KEY = 60
/**
 * Batas percobaan auth GAGAL per IP per menit (kunci salah/dicabut/tanpa
 * header). Request yang berhasil tidak dihitung ke sini — lihat komentar di
 * requirePublicApiAuth.
 */
export const RATE_LIMIT_PER_IP = 120
export const RATE_WINDOW_MS = 60_000

export interface PublicApiAuth {
  userId: string
  keyId: string
  keyName: string
  scopes: string[]
  rateLimitHeaders: Record<string, string>
}

export type PublicApiAuthResult =
  | { ok: true; auth: PublicApiAuth }
  | { ok: false; response: NextResponse }

function rateHeaders(r: { limit: number; remaining: number; resetAtMs: number }): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(r.limit),
    'X-RateLimit-Remaining': String(r.remaining),
    'X-RateLimit-Reset': String(Math.ceil(r.resetAtMs / 1000)),
  }
}

/**
 * Respons error API publik. Selain envelope repo `{success,error}` ada `code`
 * yang machine-readable supaya klien bisa bercabang tanpa parsing teks.
 */
export function apiV1Error(
  code: string,
  message: string,
  status: number,
  headers: Record<string, string> = {},
): NextResponse {
  return NextResponse.json({ success: false, error: message, code }, { status, headers })
}

/** Respons sukses + header kuota. */
export function apiV1Ok<T>(data: T, auth: PublicApiAuth, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status, headers: auth.rateLimitHeaders })
}

/**
 * Ambil kredensial dari header Authorization. HANYA header — `?api_key=`
 * sengaja tidak didukung karena query string bocor ke access log, Referer,
 * dan riwayat browser.
 */
function readBearer(req: Request): string | null {
  const raw = req.headers.get('authorization')
  if (!raw) return null
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim())
  const token = match?.[1]?.trim()
  return token && token.length > 0 ? token : null
}

export async function requirePublicApiAuth(req: Request): Promise<PublicApiAuthResult> {
  // 1. Guard tebak-kunci per IP. Dua keputusan yang saling mengunci:
  //
  //    a. Yang dihitung HANYA percobaan GAGAL (pasangan check/record, bukan
  //       consumeRateLimit). Satu server bisa memegang 3 kunci sah × 60
  //       req/menit = 180 request; kalau request sah ikut masuk bucket IP,
  //       kuota per-kunci yang kita janjikan tak pernah bisa dipakai penuh.
  //    b. Saat jatah gagal habis, request TIDAK langsung ditolak — kunci tetap
  //       diverifikasi dan yang SAH tetap dilayani. Banyak seller berbagi satu
  //       IP publik (kantor/NAT/hosting), jadi menolak buta akan mengunci orang
  //       yang tidak melakukan apa-apa gara-gara tetangga se-IP salah kunci.
  //       Biaya untuk penyerang tetap ada: jawabannya jadi 429 tanpa informasi,
  //       dan Cloudflare tetap lapis pertama untuk volume kasar.
  const ipKey = `apiv1:ip:${getClientIp(req)}`
  const ipGuard = checkRateLimit({ key: ipKey, limit: RATE_LIMIT_PER_IP, windowMs: RATE_WINDOW_MS })

  const failAuth = (code: string, message: string): PublicApiAuthResult => {
    recordRateLimitHit({ key: ipKey, windowMs: RATE_WINDOW_MS })
    if (!ipGuard.allowed) {
      // Sudah lewat jatah gagal: sembunyikan alasan aslinya.
      return {
        ok: false,
        response: apiV1Error('rate_limited', 'Terlalu banyak percobaan. Coba lagi sebentar lagi.', 429, {
          'Retry-After': String(Math.ceil(ipGuard.retryAfterMs / 1000)),
        }),
      }
    }
    return { ok: false, response: apiV1Error(code, message, 401) }
  }

  const token = readBearer(req)
  if (!token) {
    return failAuth('missing_token', 'Header Authorization: Bearer <API key> wajib diisi.')
  }

  // DB tumbang tidak boleh keluar sebagai halaman error Next (bocor stack &
  // bukan JSON) — klien API selalu berhak dapat envelope yang sama.
  let verified: Awaited<ReturnType<typeof verifySellerApiKey>>
  try {
    verified = await verifySellerApiKey(token)
  } catch (err) {
    console.error('[api/v1] gagal verifikasi kunci:', err)
    return {
      ok: false,
      response: apiV1Error('server_error', 'Gagal memverifikasi kunci API.', 500),
    }
  }

  if (!verified.ok) {
    // malformed & not_found dijawab SAMA — jangan sampai penyerang bisa
    // membedakan "formatnya salah" dari "kunci ini tidak ada".
    if (verified.reason === 'revoked') return failAuth('key_revoked', 'Kunci API sudah dicabut.')
    if (verified.reason === 'expired') return failAuth('key_expired', 'Kunci API sudah kedaluwarsa.')
    return failAuth('invalid_token', 'Kunci API tidak valid.')
  }

  // 2. Rate limit utama per kunci.
  const keyQuota = consumeRateLimit({
    key: `apiv1:key:${verified.keyId}`,
    limit: RATE_LIMIT_PER_KEY,
    windowMs: RATE_WINDOW_MS,
  })
  if (!keyQuota.allowed) {
    return {
      ok: false,
      response: apiV1Error('rate_limited', 'Kuota request per menit habis.', 429, {
        ...rateHeaders(keyQuota),
        'Retry-After': String(Math.ceil(keyQuota.retryAfterMs / 1000)),
      }),
    }
  }

  // Tidak di-await: update lastUsedAt tidak boleh menambah latensi request.
  touchApiKeyUsage(verified.keyId)

  return {
    ok: true,
    auth: {
      userId: verified.userId,
      keyId: verified.keyId,
      keyName: verified.name,
      scopes: verified.scopes,
      rateLimitHeaders: rateHeaders(keyQuota),
    },
  }
}

/**
 * Guard scope untuk Fase 2 (kirim pesan). Fase 1 semua kunci ber-scope "read".
 * 403 dipakai KHUSUS di sini — kekurangan scope memang bukan soal identitas.
 */
export function requireScope(auth: PublicApiAuth, scope: string): NextResponse | null {
  if (auth.scopes.includes(scope)) return null
  return apiV1Error(
    'insufficient_scope',
    `Kunci API ini tidak punya izin "${scope}".`,
    403,
    auth.rateLimitHeaders,
  )
}

/** Parser cursor pagination seragam untuk semua endpoint v1. */
export function parsePagination(url: URL): { ok: true; limit: number; cursor: string | null } | { ok: false; error: string } {
  const rawLimit = url.searchParams.get('limit')
  let limit = 25
  if (rawLimit !== null) {
    const n = Number(rawLimit)
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      return { ok: false, error: 'Parameter limit harus bilangan bulat 1–100.' }
    }
    limit = n
  }
  const cursor = url.searchParams.get('cursor')
  if (cursor !== null && (cursor.length === 0 || cursor.length > 64)) {
    return { ok: false, error: 'Parameter cursor tidak valid.' }
  }
  return { ok: true, limit, cursor }
}
