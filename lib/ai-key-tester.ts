// Test koneksi ke provider AI dengan minimal payload (max_tokens=1) supaya
// tidak boros saat dipanggil berulang dari halaman /admin/api-keys.
//
// Return shape uniform supaya UI bisa render konsisten:
//   { ok, status, error?, errorCode? }

export type Provider = 'ANTHROPIC' | 'OPENAI' | 'GOOGLE'

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
  // Google pakai query param `key=` bukan header.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`
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
  return { ok: false, httpStatus: 0, error: 'Provider tidak dikenal' }
}

export const PROVIDERS: readonly Provider[] = [
  'ANTHROPIC',
  'OPENAI',
  'GOOGLE',
] as const
