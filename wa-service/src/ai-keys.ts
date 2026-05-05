// Fetch decrypted API key dari Next.js (/api/internal/ai-keys/[provider]).
// Cache di memory dengan TTL 60 detik supaya tidak hit endpoint per pesan.
//
// Single source of truth: ApiKey table di nextjs DB. Kalau key belum di-set
// atau decrypt gagal, throw error dengan kode jelas supaya wa-manager bisa
// surface ke outcome `paused_invalid_apikey`.

export type Provider = 'ANTHROPIC' | 'OPENAI' | 'GOOGLE'

interface CacheEntry {
  apiKey: string
  cachedAt: number
}

const CACHE_TTL_MS = 60 * 1000
const cache = new Map<Provider, CacheEntry>()

function nextJsBase(): string {
  return process.env.NEXTJS_URL || 'http://localhost:3000'
}
function serviceSecret(): string {
  return process.env.WA_SERVICE_SECRET || ''
}

export class ApiKeyError extends Error {
  constructor(
    public provider: Provider,
    public code:
      | 'no_key'
      | 'inactive'
      | 'decrypt_failed'
      | 'unauthorized'
      | 'network',
    message: string,
  ) {
    super(message)
    this.name = 'ApiKeyError'
  }
}

export async function getApiKey(provider: Provider): Promise<string> {
  const cached = cache.get(provider)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.apiKey
  }

  const url = `${nextJsBase()}/api/internal/ai-keys/${provider}`
  let res: Response
  try {
    res = await fetch(url, {
      headers: { 'x-service-secret': serviceSecret() },
    })
  } catch (e) {
    throw new ApiKeyError(
      provider,
      'network',
      `Tidak bisa fetch API key (network): ${(e as Error).message}`,
    )
  }

  if (res.status === 404) {
    throw new ApiKeyError(
      provider,
      'no_key',
      `API key untuk ${provider} belum dikonfigurasi. Cek di /admin/api-keys`,
    )
  }
  if (res.status === 403) {
    throw new ApiKeyError(
      provider,
      'inactive',
      `API key untuk ${provider} di-set non-aktif. Cek di /admin/api-keys`,
    )
  }
  if (res.status === 401) {
    throw new ApiKeyError(
      provider,
      'unauthorized',
      'WA_SERVICE_SECRET salah / tidak ter-set',
    )
  }
  if (!res.ok) {
    throw new ApiKeyError(
      provider,
      'network',
      `Internal API error ${res.status}`,
    )
  }
  const json = (await res.json()) as
    | { success: true; data: { apiKey: string } }
    | { success: false; error: string }
  if (!json.success) {
    if (json.error === 'decrypt_failed') {
      throw new ApiKeyError(
        provider,
        'decrypt_failed',
        `Decrypt gagal — ENCRYPTION_KEY berubah? Re-input key di /admin/api-keys`,
      )
    }
    throw new ApiKeyError(provider, 'no_key', json.error)
  }
  cache.set(provider, { apiKey: json.data.apiKey, cachedAt: Date.now() })
  return json.data.apiKey
}

// Invalidate cache untuk provider tertentu (mis. setelah test failed atau
// admin update key di UI). Tidak dipakai sekarang tapi disediakan kalau
// nanti ada webhook/event-bus.
export function invalidateApiKeyCache(provider?: Provider): void {
  if (provider) cache.delete(provider)
  else cache.clear()
}
