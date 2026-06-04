// Test koneksi ke provider AI dengan minimal payload (max_tokens=1) supaya
// tidak boros saat dipanggil berulang dari halaman /admin/api-keys.
//
// Return shape uniform supaya UI bisa render konsisten:
//   { ok, status, error?, errorCode? }

export type Provider = 'ANTHROPIC' | 'OPENAI' | 'GOOGLE' | 'KLING' | 'ELEVENLABS'

export interface TestResult {
  ok: boolean
  httpStatus: number
  error?: string
  rawError?: string
}

// Map HTTP status ke pesan yang bermakna untuk admin.
function interpretStatus(status: number, raw?: string): string {
  if (status === 200 || status === 201) return ''
  if (status === 401 || status === 403) return 'API key salah / expired'
  if (status === 429) return 'Rate limit / quota habis'
  if (status === 402) return 'Saldo provider habis'
  if (status >= 500) return `Server provider error (${status})`
  return raw ? raw.slice(0, 300) : `HTTP ${status}`
}

async function readError(res: Response): Promise<string> {
  try {
    const text = await res.text()
    return text.length > 800 ? `${text.slice(0, 800)}…` : text
  } catch {
    return ''
  }
}

async function testAnthropic(apiKey: string): Promise<TestResult> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })
    if (res.ok) return { ok: true, httpStatus: res.status }
    const raw = await readError(res)
    return {
      ok: false,
      httpStatus: res.status,
      error: interpretStatus(res.status, raw),
      rawError: raw,
    }
  } catch (e) {
    return { ok: false, httpStatus: 0, error: (e as Error).message }
  }
}

async function testOpenAi(apiKey: string): Promise<TestResult> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })
    if (res.ok) return { ok: true, httpStatus: res.status }
    const raw = await readError(res)
    return {
      ok: false,
      httpStatus: res.status,
      error: interpretStatus(res.status, raw),
      rawError: raw,
    }
  } catch (e) {
    return { ok: false, httpStatus: 0, error: (e as Error).message }
  }
}

async function testGoogle(apiKey: string): Promise<TestResult> {
  // Google pakai query param `key=` bukan header. Pakai `gemini-2.5-flash` —
  // `gemini-2.0-flash` sudah deprecated untuk user baru per akhir 2026
  // (return 404 "no longer available to new users").
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
        generationConfig: { maxOutputTokens: 1 },
      }),
    })
    if (res.ok) return { ok: true, httpStatus: res.status }
    const raw = await readError(res)
    return {
      ok: false,
      httpStatus: res.status,
      error: interpretStatus(res.status, raw),
      rawError: raw,
    }
  } catch (e) {
    return { ok: false, httpStatus: 0, error: (e as Error).message }
  }
}

// Test KLING key (official api.klingai.com). Auth pakai JWT HS256 di-sign
// dari AccessKey:SecretKey colon-separated. Liveness check: GET task list
// (return 200 + list kosong kalau belum ada task). Endpoint 401 kalau JWT
// invalid → bantu user diagnose.
import { createHmac } from 'node:crypto'

function b64urlForTest(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function signTestJwt(accessKey: string, secretKey: string): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = { iss: accessKey, exp: now + 300, nbf: now - 5 }
  const h = b64urlForTest(Buffer.from(JSON.stringify(header)))
  const p = b64urlForTest(Buffer.from(JSON.stringify(payload)))
  const data = `${h}.${p}`
  const sig = b64urlForTest(
    createHmac('sha256', secretKey).update(data).digest(),
  )
  return `${data}.${sig}`
}

async function testKling(apiKey: string): Promise<TestResult> {
  // Expect format "AccessKey:SecretKey".
  const idx = apiKey.indexOf(':')
  if (idx <= 0 || idx >= apiKey.length - 1) {
    return {
      ok: false,
      httpStatus: 0,
      error:
        'Format key harus "AccessKey:SecretKey" (2 key, pisah pakai titik dua). Dapat dari platform.klingai.com → Developer → API Keys.',
    }
  }
  const accessKey = apiKey.slice(0, idx).trim()
  const secretKey = apiKey.slice(idx + 1).trim()
  if (!accessKey || !secretKey) {
    return {
      ok: false,
      httpStatus: 0,
      error: 'AccessKey atau SecretKey kosong setelah split.',
    }
  }

  try {
    const jwt = signTestJwt(accessKey, secretKey)
    // List image2video tasks (paginated). Return 200 walau kosong = key valid.
    const res = await fetch(
      'https://api.klingai.com/v1/videos/image2video?pageNum=1&pageSize=1',
      {
        method: 'GET',
        headers: { authorization: `Bearer ${jwt}` },
      },
    )
    if (res.ok) {
      const text = await res.text()
      try {
        const json = JSON.parse(text) as { code?: number; message?: string }
        if (json.code === 0) return { ok: true, httpStatus: res.status }
        return {
          ok: false,
          httpStatus: res.status,
          error: `Kling response code=${json.code} ${json.message ?? ''}`,
          rawError: text.slice(0, 300),
        }
      } catch {
        return { ok: true, httpStatus: res.status }
      }
    }
    const raw = await readError(res)
    return {
      ok: false,
      httpStatus: res.status,
      error: interpretStatus(res.status, raw),
      rawError: raw,
    }
  } catch (e) {
    return { ok: false, httpStatus: 0, error: (e as Error).message }
  }
}

export async function testApiKey(
  provider: Provider,
  apiKey: string,
): Promise<TestResult> {
  if (!apiKey) {
    return { ok: false, httpStatus: 0, error: 'API key kosong' }
  }
  if (provider === 'ANTHROPIC') return testAnthropic(apiKey)
  if (provider === 'OPENAI') return testOpenAi(apiKey)
  if (provider === 'GOOGLE') return testGoogle(apiKey)
  if (provider === 'KLING') return testKling(apiKey)
  if (provider === 'ELEVENLABS') return testElevenLabs(apiKey)
  return { ok: false, httpStatus: 0, error: 'Provider tidak dikenal' }
}

// ElevenLabs test — call GET /v1/user (auth-required, kembalikan 401 kalau invalid).
// JANGAN pakai /v1/voices — itu public endpoint, return 200 walau key salah.
//
// IMPORTANT: Node 22 fetch (undici) gak handle IPv6→IPv4 fallback dengan benar
// untuk endpoint ini — connect ETIMEDOUT walau curl jalan 1dtk. Workaround:
// pakai node:https module langsung dengan family=4 (IPv4-only). Tested OK.
async function testElevenLabs(apiKey: string): Promise<TestResult> {
  const trimmed = apiKey.trim()
  if (!trimmed) return { ok: false, httpStatus: 0, error: 'Key kosong setelah trim' }
  return new Promise<TestResult>((resolve) => {
    const https = require('https') as typeof import('https')
    let settled = false
    const settle = (r: TestResult) => {
      if (settled) return
      settled = true
      resolve(r)
    }
    // Pakai /v1/models (auth-required, return 401 kalau key invalid, TAPI gak
    // butuh permission `user_read` — vs /v1/user yang butuh permission tsb).
    // Cocok untuk key dengan permission minimal Text-to-Speech.
    const req = https.request(
      {
        hostname: 'api.elevenlabs.io',
        port: 443,
        path: '/v1/models',
        method: 'GET',
        family: 4,
        headers: { 'xi-api-key': trimmed, accept: 'application/json' },
        timeout: 12_000,
      },
      (res) => {
        const status = res.statusCode ?? 0
        let body = ''
        res.on('data', (c: Buffer) => {
          body += c.toString('utf8')
          if (body.length > 4000) body = body.slice(0, 4000)
        })
        res.on('end', () => {
          if (status === 401 || status === 403) {
            return settle({
              ok: false,
              httpStatus: status,
              error: `Key invalid (${status}): ${body.slice(0, 150)}`,
            })
          }
          if (status >= 200 && status < 300) {
            return settle({ ok: true, httpStatus: status })
          }
          return settle({
            ok: false,
            httpStatus: status,
            error: friendlyHttp(status) ?? body.slice(0, 200),
          })
        })
      },
    )
    req.on('timeout', () => {
      req.destroy()
      settle({ ok: false, httpStatus: 0, error: 'Request timeout (12s)' })
    })
    req.on('error', (e: Error & { code?: string }) => {
      settle({
        ok: false,
        httpStatus: 0,
        error: `${e.name}: ${e.message}${e.code ? ` (${e.code})` : ''}`.slice(0, 250),
      })
    })
    req.end()
  })
}

export const PROVIDERS: readonly Provider[] = [
  'ANTHROPIC',
  'OPENAI',
  'GOOGLE',
  'KLING',
  'ELEVENLABS',
] as const
