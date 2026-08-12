// Resolver API key AI per provider untuk kode yang jalan DI DALAM Next.js
// (webhook Cloud API dkk). Pola sama dengan lib/anthropic.ts: DB (ApiKey
// aktif, terenkripsi) dulu → fallback env. Cache 60 detik per provider.
//
// wa-service (Baileys) tetap memakai jalur HTTP /api/internal/ai-keys/*.

import { decrypt } from '@/lib/crypto'
import { prisma } from '@/lib/prisma'

export type CsAiProvider = 'ANTHROPIC' | 'OPENAI' | 'GOOGLE'

const ENV_FALLBACK: Record<CsAiProvider, string | undefined> = {
  ANTHROPIC: process.env.ANTHROPIC_API_KEY,
  OPENAI: process.env.OPENAI_API_KEY,
  GOOGLE: process.env.GOOGLE_AI_API_KEY,
}

/** Error bertipe supaya caller bisa membedakan "key invalid" dari error lain. */
export class ApiKeyError extends Error {
  constructor(
    message: string,
    public readonly code: 'no_key' | 'inactive' | 'decrypt_failed',
  ) {
    super(message)
    this.name = 'ApiKeyError'
  }
}

const KEY_TTL_MS = 60_000
const keyCache = new Map<CsAiProvider, { key: string; cachedAt: number }>()

export async function getAiApiKey(provider: CsAiProvider): Promise<string> {
  const cached = keyCache.get(provider)
  if (cached && Date.now() - cached.cachedAt < KEY_TTL_MS) return cached.key

  let key = ''
  try {
    const row = await prisma.apiKey.findUnique({ where: { provider } })
    if (row?.isActive) key = decrypt(row.apiKey)
  } catch {
    // DB error / decrypt gagal → jatuh ke env fallback di bawah.
  }
  if (!key) key = ENV_FALLBACK[provider] ?? ''
  if (!key) {
    throw new ApiKeyError(
      `API key ${provider} belum di-set. Isi di /admin/api-keys atau env.`,
      'no_key',
    )
  }
  keyCache.set(provider, { key, cachedAt: Date.now() })
  return key
}
