// API key loader untuk live room (ANTHROPIC chat + OPENAI tts).
// Pakai pola yg sama dengan host-gen/provider-keys.ts (ApiKey table di DB,
// decrypt, cache 60dtk).
import { decrypt } from '@/lib/crypto'
import { prisma } from '@/lib/prisma'

export type LiveProvider = 'ANTHROPIC' | 'OPENAI'

const TTL_MS = 60_000
const cache = new Map<LiveProvider, { key: string; cachedAt: number }>()

export async function getLiveApiKey(provider: LiveProvider): Promise<string> {
  const hit = cache.get(provider)
  if (hit && Date.now() - hit.cachedAt < TTL_MS) return hit.key

  const row = await prisma.apiKey.findUnique({ where: { provider } })
  if (!row) {
    throw new Error(
      `API key ${provider} belum di-set. Owner harus isi di /admin/api-keys.`,
    )
  }
  if (!row.isActive) {
    throw new Error(`API key ${provider} non-aktif.`)
  }
  const key = decrypt(row.apiKey)
  cache.set(provider, { key, cachedAt: Date.now() })
  return key
}

export function invalidateLiveKeyCache(provider?: LiveProvider): void {
  if (provider) cache.delete(provider)
  else cache.clear()
}
