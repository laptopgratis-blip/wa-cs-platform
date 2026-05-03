// Wrapper Anthropic SDK untuk Next.js side. Lazy-init client supaya
// process.env terbaca setelah .env.local di-load.
//
// Catatan: wa-service punya wrapper sendiri (wa-service/src/ai-handler.ts)
// karena jalan sebagai proses terpisah dengan dotenv-flow.
import Anthropic from '@anthropic-ai/sdk'

let cached: Anthropic | null = null
let cachedKey = ''

export function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY belum di-set di .env.local')
  }
  if (cached && cachedKey === apiKey) return cached
  cached = new Anthropic({ apiKey })
  cachedKey = apiKey
  return cached
}

// Default model untuk task umum (haiku — cepat & murah, cocok untuk
// HTML generation yang butuh output panjang).
export const DEFAULT_MODEL = 'claude-haiku-4-5'
