// Wrapper Anthropic SDK untuk Next.js side. Lazy-init client.
//
// Sumber API key: tabel ApiKey (provider=ANTHROPIC) yang di-set lewat
// /admin/api-keys (ter-enkripsi), SAMA dengan fitur Live/host-gen. Kalau
// row DB belum ada/non-aktif, fallback ke process.env.ANTHROPIC_API_KEY.
// Ini cegah kasus key env basi/revoked sementara admin sudah update key di DB.
//
// Catatan: wa-service punya wrapper sendiri (wa-service/src/ai-handler.ts)
// karena jalan sebagai proses terpisah dengan dotenv-flow.
import Anthropic from '@anthropic-ai/sdk'

import { decrypt } from '@/lib/crypto'
import { prisma } from '@/lib/prisma'

let cached: Anthropic | null = null
let cachedKey = ''

const KEY_TTL_MS = 60_000
let keyCache: { key: string; cachedAt: number } | null = null

// Resolusi API key: DB dulu (ApiKey aktif), kalau gagal baru env. Cache 60dtk.
async function resolveAnthropicKey(): Promise<string> {
  if (keyCache && Date.now() - keyCache.cachedAt < KEY_TTL_MS) {
    return keyCache.key
  }
  let key = ''
  try {
    const row = await prisma.apiKey.findUnique({
      where: { provider: 'ANTHROPIC' },
    })
    if (row?.isActive) {
      key = decrypt(row.apiKey)
    }
  } catch {
    // DB error / decrypt gagal → jatuh ke env fallback di bawah.
  }
  if (!key) {
    key = process.env.ANTHROPIC_API_KEY ?? ''
  }
  if (!key) {
    throw new Error(
      'API key ANTHROPIC belum di-set. Isi di /admin/api-keys atau ANTHROPIC_API_KEY di env.',
    )
  }
  keyCache = { key, cachedAt: Date.now() }
  return key
}

export async function getAnthropicClient(): Promise<Anthropic> {
  const apiKey = await resolveAnthropicKey()
  if (cached && cachedKey === apiKey) return cached
  cached = new Anthropic({ apiKey })
  cachedKey = apiKey
  return cached
}

// Default model untuk task umum (haiku — cepat & murah, cocok untuk
// HTML generation yang butuh output panjang).
export const DEFAULT_MODEL = 'claude-haiku-4-5'
