// Auth Kling API — dua skema, dideteksi dari bentuk key tersimpan:
//   1. API Key tunggal (baru, 2026): dibuat di platform.klingai.com → API Key →
//      "Create a new API Key" (format `api-key-kling-…`). Dipakai LANGSUNG
//      sebagai `Authorization: Bearer <key>` tanpa signing apa pun.
//   2. Legacy AccessKey:SecretKey (colon-separated): di-sign jadi JWT HS256
//      per call (iss=AccessKey, exp=now+TTL, nbf=now-5) — Kling menandai skema
//      ini "legacy version design standards"; dipertahankan hanya untuk key
//      lama yang masih tersimpan di DB.
// Aturan deteksi: ada colon = legacy pair, tanpa colon = key tunggal.
// Dipakai lib/services/host-gen/kling.ts (runtime) + lib/ai-key-tester.ts
// (tombol Test /admin/api-keys) supaya logikanya satu sumber.
import { createHmac } from 'node:crypto'

export type KlingKey =
  | { kind: 'single'; apiKey: string }
  | { kind: 'legacy'; accessKey: string; secretKey: string }

const KEY_FORMAT_HINT =
  'API key Kling tidak valid. Buat API Key di platform.klingai.com (menu API Key → "Create a new API Key") lalu tempel utuh — atau pakai format lama "AccessKey:SecretKey".'

// Default TTL JWT legacy 30 menit (sesuai spec Kling lama).
const DEFAULT_JWT_TTL_SEC = 1800

// Base64URL encode tanpa padding.
function b64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

/** Parse key Kling tersimpan → skema auth. Lempar Error (pesan actionable) kalau bentuknya tidak valid. */
export function parseKlingKey(raw: string): KlingKey {
  const value = raw.trim()
  if (!value) throw new Error(KEY_FORMAT_HINT)

  const idx = value.indexOf(':')
  if (idx === -1) return { kind: 'single', apiKey: value }

  const accessKey = value.slice(0, idx).trim()
  const secretKey = value.slice(idx + 1).trim()
  if (!accessKey || !secretKey) throw new Error(KEY_FORMAT_HINT)
  return { kind: 'legacy', accessKey, secretKey }
}

/** Sign JWT HS256 legacy Kling: iss=AccessKey, exp=now+TTL, nbf=now-5. */
export function signKlingJwt(
  accessKey: string,
  secretKey: string,
  ttlSec: number = DEFAULT_JWT_TTL_SEC,
): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = { iss: accessKey, exp: now + ttlSec, nbf: now - 5 }
  const h = b64url(Buffer.from(JSON.stringify(header)))
  const p = b64url(Buffer.from(JSON.stringify(payload)))
  const data = `${h}.${p}`
  const sig = b64url(createHmac('sha256', secretKey).update(data).digest())
  return `${data}.${sig}`
}

/**
 * Bangun nilai header `Authorization` dari key tersimpan (kedua skema).
 * Key tunggal → Bearer verbatim; legacy pair → Bearer JWT ber-TTL.
 */
export function klingAuthHeader(
  raw: string,
  ttlSec: number = DEFAULT_JWT_TTL_SEC,
): string {
  const key = parseKlingKey(raw)
  if (key.kind === 'single') return `Bearer ${key.apiKey}`
  return `Bearer ${signKlingJwt(key.accessKey, key.secretKey, ttlSec)}`
}
