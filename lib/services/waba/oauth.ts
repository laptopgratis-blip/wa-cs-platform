// Embedded Signup OAuth — pembuatan URL dialog + exchange code → token.
// State anti-CSRF dienkripsi AES-256-GCM (lib/crypto.ts) dan berumur 10 menit.

import { decrypt, encrypt } from '@/lib/crypto'
import { getMetaConfig } from './config'

const STATE_TTL_MS = 10 * 60 * 1000

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

/** URL dialog OAuth Embedded Signup (dibuka di popup dari halaman WhatsApp). */
export function buildSignupUrl(state: string): string {
  const cfg = getMetaConfig()
  if (!cfg.configId) {
    throw new Error('META_CONFIG_ID kosong — buat konfigurasi Embedded Signup di Meta App dashboard')
  }
  const params = new URLSearchParams({
    client_id: cfg.appId,
    redirect_uri: cfg.redirectUri,
    state,
    config_id: cfg.configId,
    response_type: 'code',
    scope: 'whatsapp_business_management,whatsapp_business_messaging',
  })
  return `https://www.facebook.com/${cfg.graphVersion}/dialog/oauth?${params.toString()}`
}

export interface TokenExchangeResult {
  ok: boolean
  accessToken?: string
  /** Detik sampai kedaluwarsa (default Meta ±60 hari untuk long-lived). */
  expiresIn?: number
  error?: string
}

/**
 * Tukar authorization code → access token. Code kita berasal dari REDIRECT
 * dialog OAuth (bukan FB JS SDK), jadi Meta MEWAJIBKAN redirect_uri yang
 * identik dengan yang dipakai saat membuka dialog. Retry 3× untuk error
 * jaringan.
 */
export async function exchangeCodeForToken(code: string): Promise<TokenExchangeResult> {
  const cfg = getMetaConfig()
  const url =
    `${cfg.graphBaseUrl}/oauth/access_token?` +
    new URLSearchParams({
      client_id: cfg.appId,
      client_secret: cfg.appSecret,
      redirect_uri: cfg.redirectUri,
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
      // Meta kadang tidak mengirim expires_in — fallback 60 hari.
      return { ok: true, accessToken: json.access_token, expiresIn: json.expires_in ?? 5_184_000 }
    }
    return { ok: false, error: json?.error?.message ?? `refresh gagal (HTTP ${res.status})` }
  } catch (err) {
    return { ok: false, error: `refresh gagal: ${(err as Error).message}` }
  }
}
