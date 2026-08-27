// Embedded Signup OAuth — state anti-CSRF + exchange code → token (jalur FB JS SDK).
// State anti-CSRF dienkripsi AES-256-GCM (lib/crypto.ts) dan berumur 30 menit.

import { decrypt, encrypt } from '@/lib/crypto'
import { getMetaConfig } from './config'

// 30 menit: wizard Meta bisa lama (buat portofolio bisnis, verifikasi OTP nomor).
const STATE_TTL_MS = 30 * 60 * 1000

interface SignupState {
  userId: string
  nonce: string
  ts: number
}

export function createSignupState(userId: string): string {
  const state: SignupState = {
    userId,
    nonce: crypto.randomUUID(),
    ts: Date.now(),
  }
  return Buffer.from(encrypt(JSON.stringify(state))).toString('base64url')
}

/**
 * Validasi state dari callback. Return userId di dalamnya, atau null kalau
 * state rusak/kedaluwarsa — caller wajib cocokkan dengan user sesi login.
 */
export function validateSignupState(rawState: string): { userId: string } | null {
  try {
    const decoded = Buffer.from(rawState, 'base64url').toString('utf8')
    const state = JSON.parse(decrypt(decoded)) as SignupState
    if (!state.userId || typeof state.ts !== 'number') return null
    if (Date.now() - state.ts > STATE_TTL_MS) return null
    return { userId: state.userId }
  } catch {
    return null
  }
}

export interface TokenExchangeResult {
  ok: boolean
  accessToken?: string
  /** Detik sampai kedaluwarsa (default Meta ±60 hari untuk long-lived). */
  expiresIn?: number
  error?: string
}

/**
 * Tukar authorization code → access token. Code berasal dari FB JS SDK
 * (FB.login dengan config_id Embedded Signup) — jalur ini TANPA redirect_uri;
 * menyertakannya justru ditolak Meta. Retry 3× untuk error jaringan.
 */
export async function exchangeCodeForToken(code: string): Promise<TokenExchangeResult> {
  const cfg = getMetaConfig()
  const url =
    `${cfg.graphBaseUrl}/oauth/access_token?` +
    new URLSearchParams({
      client_id: cfg.appId,
      client_secret: cfg.appSecret,
      code,
    }).toString()

  let lastError = ''
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30_000) })
      const json = (await res.json().catch(() => null)) as {
        access_token?: string
        expires_in?: number
        error?: { message?: string; code?: number }
      } | null

      if (json?.access_token) {
        return { ok: true, accessToken: json.access_token, expiresIn: json.expires_in }
      }
      // Error dari Meta (code invalid/terpakai) tidak akan sembuh dengan
      // retry — langsung berhenti.
      return {
        ok: false,
        error: json?.error?.message ?? `exchange gagal (HTTP ${res.status})`,
      }
    } catch (err) {
      lastError = (err as Error).message
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1_000))
    }
  }
  return { ok: false, error: `exchange gagal setelah 3 percobaan: ${lastError}` }
}

/**
 * Perpanjang token long-lived (dipakai cron refresh sebelum expiry 60 hari).
 */
export async function refreshLongLivedToken(currentToken: string): Promise<TokenExchangeResult> {
  const cfg = getMetaConfig()
  const url =
    `${cfg.graphBaseUrl}/oauth/access_token?` +
    new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: cfg.appId,
      client_secret: cfg.appSecret,
      fb_exchange_token: currentToken,
    }).toString()

  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30_000) })
    const json = (await res.json().catch(() => null)) as {
      access_token?: string
      expires_in?: number
      error?: { message?: string }
    } | null
    if (json?.access_token) {
      // expires_in absen = token never-expire → biarkan undefined (jangan
      // dipaksa 60 hari; itu memicu refresh sia-sia + false ERROR di cron).
      return { ok: true, accessToken: json.access_token, expiresIn: json.expires_in }
    }
    return { ok: false, error: json?.error?.message ?? `refresh gagal (HTTP ${res.status})` }
  } catch (err) {
    return { ok: false, error: `refresh gagal: ${(err as Error).message}` }
  }
}
