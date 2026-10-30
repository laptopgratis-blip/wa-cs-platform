// Unduh gambar image_url API publik DI NEXT, lalu kirim sebagai bytes.
//
// Dulu URL diteruskan ke wa-service dan Baileys yang men-fetch: guard SSRF
// hanya memeriksa URL pertama, sedangkan fetch() Baileys mengikuti redirect
// & me-resolve DNS ulang → URL publik yang membalas 302 ke alamat internal
// (atau DNS rebinding) tetap tembus, dan isinya terkirim ke WhatsApp.
//
// Sekarang:
// - Redirect diikuti MANUAL (maks MAX_IMAGE_REDIRECTS); setiap hop divalidasi
//   ulang (https, tanpa kredensial, IP publik) SEBELUM disentuh.
// - Koneksi memakai guardedLookup → alamat yang BENAR-BENAR dipakai socket
//   divalidasi (anti DNS rebinding).
// - Cap 5 MB (Content-Length & hitungan stream), batas waktu total, format
//   dari magic bytes (JPEG/PNG/WebP) — selaras image_base64.
// Hasilnya DecodedImage yang dikirim lewat jalur buffer (Baileys buffer,
// Cloud upload media) — wa-service tidak pernah men-fetch URL dari seller.
import http from 'node:http'
import https from 'node:https'
import { isIP } from 'node:net'

import {
  MAX_IMAGE_BYTES,
  sniffImageMime,
  type DecodedImage,
} from '@/lib/services/public-api/image-data'
import {
  assertSafeWebhookUrl,
  guardedLookup,
  isBlockedIp,
} from '@/lib/services/webhooks/url-guard'

export const MAX_IMAGE_REDIRECTS = 3
export const IMAGE_FETCH_TIMEOUT_MS = 15_000
// Socket diam lebih lama dari ini = gagal (batas total tetap berlaku).
const SOCKET_IDLE_MS = 10_000

export type HopResult =
  | { kind: 'redirect'; status: number; location: string | null }
  | { kind: 'body'; status: number; buffer: Buffer }
  | { kind: 'too_large' }
  /** `error` = detail teknis, hanya untuk log server. */
  | { kind: 'error'; error: string }

export interface HopOptions {
  maxBytes: number
  signal: AbortSignal
}

export interface ImageFetchDeps {
  /** Validasi satu URL; throw Error berpesan siap-UI bila ditolak. */
  assertUrl: (raw: string) => Promise<URL>
  /** Satu GET tanpa mengikuti redirect. NEVER throw. */
  getOnce: (url: URL, opts: HopOptions) => Promise<HopResult>
}

export type FetchImageResult =
  { ok: true; image: DecodedImage } | { ok: false; error: string }

const defaultDeps: ImageFetchDeps = {
  assertUrl: assertSafeWebhookUrl,
  getOnce: httpGetImageOnce,
}

function fail(error: string): FetchImageResult {
  return { ok: false, error }
}

type HopCheck = { ok: true; url: URL } | { ok: false; error: string }

/** Validasi satu hop lewat guard. NEVER throw. */
async function validateHop(
  deps: ImageFetchDeps,
  raw: string,
  hop: number,
): Promise<HopCheck> {
  try {
    return { ok: true, url: await deps.assertUrl(raw) }
  } catch (err) {
    // Pesan guard ditulis untuk webhook — sesuaikan konteksnya.
    const reason = (err as Error).message.replace('URL webhook', 'URL gambar')
    return {
      ok: false,
      error: `image_url ditolak${hop > 0 ? ' (setelah redirect)' : ''}: ${reason}`,
    }
  }
}

/** Selesai bersama promise, atau null begitu signal abort (mana duluan). */
function untilAborted<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T | null> {
  if (signal.aborted) return Promise.resolve(null)
  return new Promise((resolve) => {
    const onAbort = () => resolve(null)
    signal.addEventListener('abort', onAbort, { once: true })
    void promise.then((value) => {
      signal.removeEventListener('abort', onAbort)
      resolve(value)
    })
  })
}

function redirectTarget(
  location: string | null,
  base: URL,
): { ok: true; href: string } | { ok: false; error: string } {
  if (!location) {
    return { ok: false, error: 'image_url redirect tanpa alamat tujuan.' }
  }
  try {
    return { ok: true, href: new URL(location, base).toString() }
  } catch {
    return { ok: false, error: 'image_url redirect ke alamat yang tidak valid.' }
  }
}

/** Hasil akhir dari hop non-redirect: cek status, ukuran, format. */
function finalResult(
  res: Exclude<HopResult, { kind: 'redirect' }>,
  url: URL,
): FetchImageResult {
  if (res.kind === 'too_large') {
    return fail('Gambar terlalu besar — maksimal 5 MB.')
  }
  if (res.kind === 'error') {
    console.warn(`[public-api/image-fetch] unduh ${url.host} gagal: ${res.error}`)
    return fail(
      'image_url tidak bisa diunduh. Pastikan URL bisa diakses publik, lalu coba lagi.',
    )
  }
  if (res.status < 200 || res.status >= 300) {
    return fail(`image_url tidak bisa diunduh (HTTP ${res.status}).`)
  }
  if (res.buffer.length === 0) {
    return fail('image_url mengembalikan file kosong.')
  }
  const mime = sniffImageMime(res.buffer)
  if (!mime) {
    return fail('Format gambar tidak dikenali — dukungan: JPEG, PNG, WebP.')
  }
  return { ok: true, image: { buffer: res.buffer, mime } }
}

/** Unduh + validasi gambar dari URL seller. NEVER throw. */
export async function fetchImageFromUrl(
  raw: string,
  deps: ImageFetchDeps = defaultDeps,
  opts: { timeoutMs?: number } = {},
): Promise<FetchImageResult> {
  const timeoutMs = opts.timeoutMs ?? IMAGE_FETCH_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const timedOut = () =>
    fail(`image_url tidak merespons dalam ${Math.ceil(timeoutMs / 1000)} detik.`)
  try {
    let current = raw
    for (let hop = 0; hop <= MAX_IMAGE_REDIRECTS; hop++) {
      // dns.lookup di guard tidak bisa dibatalkan → balapan dengan batas
      // waktu total supaya resolver lambat milik penyerang tak menahan request.
      const checked = await untilAborted(
        validateHop(deps, current, hop),
        controller.signal,
      )
      if (!checked) return timedOut()
      if (!checked.ok) return checked

      const res = await deps.getOnce(checked.url, {
        maxBytes: MAX_IMAGE_BYTES,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return timedOut()
      if (res.kind !== 'redirect') return finalResult(res, checked.url)

      const next = redirectTarget(res.location, checked.url)
      if (!next.ok) return next
      current = next.href
    }
    return fail(
      `image_url terlalu banyak redirect (maks ${MAX_IMAGE_REDIRECTS}).`,
    )
  } finally {
    clearTimeout(timer)
  }
}

type Settle = (r: HopResult) => void

/** Tangani respons satu GET: redirect, status, cap ukuran. */
function collectResponse(
  res: http.IncomingMessage,
  maxBytes: number,
  settle: Settle,
): void {
  const status = res.statusCode ?? 0
  if (status >= 300 && status < 400) {
    settle({ kind: 'redirect', status, location: res.headers.location ?? null })
    res.destroy()
    return
  }
  if (status < 200 || status >= 300) {
    settle({ kind: 'body', status, buffer: Buffer.alloc(0) })
    res.destroy()
    return
  }
  const declared = Number(res.headers['content-length'])
  if (Number.isFinite(declared) && declared > maxBytes) {
    settle({ kind: 'too_large' })
    res.destroy()
    return
  }
  const chunks: Buffer[] = []
  let seen = 0
  res.on('data', (chunk: Buffer) => {
    seen += chunk.length
    if (seen > maxBytes) {
      settle({ kind: 'too_large' })
      res.destroy()
      return
    }
    chunks.push(chunk)
  })
  res.on('end', () =>
    settle({ kind: 'body', status, buffer: Buffer.concat(chunks) }),
  )
  res.on('error', (err) => settle({ kind: 'error', error: err.message }))
  // 'close' tanpa 'end' = koneksi putus di tengah body.
  res.on('close', () =>
    settle({ kind: 'error', error: 'koneksi tertutup sebelum body selesai' }),
  )
}

/**
 * Satu GET dengan guardedLookup, TANPA mengikuti redirect (http/https Node
 * memang tidak mengikuti; 3xx dikembalikan ke pemanggil untuk divalidasi).
 * NEVER throw. Diekspor untuk uji.
 */
export function httpGetImageOnce(
  url: URL,
  opts: HopOptions,
): Promise<HopResult> {
  // Node melewati `lookup` untuk host IP literal → guardedLookup tak jalan.
  // Cek di sini juga supaya fungsi ini aman walau dipanggil tanpa assertUrl.
  const bareHost = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(bareHost) && isBlockedIp(bareHost)) {
    return Promise.resolve({
      kind: 'error',
      error: 'alamat IP internal/privat ditolak (guard SSRF)',
    })
  }
  return new Promise((resolve) => {
    // Satu pintu resolve — 'end', 'close', 'error' bisa terpicu beruntun.
    let done = false
    const settle: Settle = (r) => {
      if (done) return
      done = true
      resolve(r)
    }

    // http hanya lolos assertSafeWebhookUrl saat WEBHOOK_ALLOW_PRIVATE_URL=1
    // (dev) — di lingkungan normal skema http ditolak sebelum sampai sini.
    const mod = url.protocol === 'http:' ? http : https
    const req = mod.request(
      url,
      {
        method: 'GET',
        // Validasi alamat TEPAT saat koneksi dibuat (anti DNS-rebinding).
        lookup: guardedLookup,
        // Koneksi sekali pakai: tanpa ini agent global (keep-alive) memakai
        // ulang socket lama → lookup (guard) tidak dipanggil lagi, dan socket
        // ke server seller menggantung di pool.
        agent: false,
        headers: {
          'User-Agent': 'Hulao-Image-Fetch/1.0',
          Accept: 'image/jpeg,image/png,image/webp',
        },
        timeout: SOCKET_IDLE_MS,
        signal: opts.signal,
      },
      (res) => collectResponse(res, opts.maxBytes, settle),
    )
    req.on('timeout', () => req.destroy(new Error('socket timeout')))
    req.on('error', (err) => settle({ kind: 'error', error: err.message }))
    req.end()
  })
}
