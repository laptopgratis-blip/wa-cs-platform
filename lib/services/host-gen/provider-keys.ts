// Helper akses API key untuk host-gen (Gemini Nano Banana + Kling/Fal.ai).
// Pakai pola yg sama dengan soul-simulation.ts: cache 60dtk, decrypt sekali.
import { decrypt } from '@/lib/crypto'
import { prisma } from '@/lib/prisma'

export type HostGenProvider = 'GOOGLE' | 'KLING'

const KEY_CACHE_TTL_MS = 60_000
const apiKeyCache = new Map<HostGenProvider, { key: string; cachedAt: number }>()

export async function getHostGenApiKey(
  provider: HostGenProvider,
): Promise<string> {
  const hit = apiKeyCache.get(provider)
  if (hit && Date.now() - hit.cachedAt < KEY_CACHE_TTL_MS) return hit.key

  const row = await prisma.apiKey.findUnique({ where: { provider } })
  if (!row) {
    throw new Error(
      `API key ${provider} belum di-set. Buka /admin/api-keys.`,
    )
  }
  if (!row.isActive) {
    throw new Error(`API key ${provider} non-aktif. Aktifkan di /admin/api-keys.`)
  }
  const key = decrypt(row.apiKey)
  apiKeyCache.set(provider, { key, cachedAt: Date.now() })
  return key
}

export function invalidateHostGenKeyCache(provider?: HostGenProvider): void {
  if (provider) apiKeyCache.delete(provider)
  else apiKeyCache.clear()
}
