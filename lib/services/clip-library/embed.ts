// OpenAI embedding service untuk match clip ke customer question.
//
// Model: text-embedding-3-small (1536-dim, ~$0.02/1M token = ~$0.00002 per query).
// Storage: JSON array di LiveClip.embedding column (Sprint 4 MVP).
//   Cosine similarity dihitung in-memory dengan numpy-like loop.
//   Untuk scale 1000+ clips per host, migrasi ke pgvector di Sprint 5 polish.

import { Buffer } from 'node:buffer'

import { getLiveApiKey } from '@/lib/services/live/provider-keys'
import { chargeUsage } from '@/lib/services/usage-charge'

const EMBED_URL = 'https://api.openai.com/v1/embeddings'
export const EMBED_MODEL = 'text-embedding-3-small'
export const EMBED_DIM = 1536

export interface EmbedOptions {
  // Charge ke userId — kalau gak pass, skip charge (legacy).
  userId?: string
  subjectType?: string
  subjectId?: string
}

export async function embedText(
  text: string,
  options: EmbedOptions = {},
): Promise<number[]> {
  const apiKey = await getLiveApiKey('OPENAI')
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Embed text kosong')

  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: trimmed.slice(0, 8000), // tokens limit safety
      encoding_format: 'float',
    }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Embed gagal HTTP ${res.status}: ${err.slice(0, 200)}`)
  }
  const json = (await res.json()) as {
    data?: Array<{ embedding?: number[] }>
    usage?: { total_tokens?: number }
  }
  const vec = json.data?.[0]?.embedding
  if (!vec || vec.length !== EMBED_DIM) {
    throw new Error(`Embed return invalid (len=${vec?.length})`)
  }

  // Charge dari real usage.total_tokens (OpenAI return). Fallback estimasi ke
  // chars/4 (~OpenAI tokenizer ratio).
  if (options.userId) {
    const tokens = json.usage?.total_tokens ?? Math.ceil(trimmed.length / 4)
    await chargeUsage({
      userId: options.userId,
      featureKey: 'KLIP_LIVE_EMBED',
      units: tokens,
      reference: `embed_${options.subjectId ?? Date.now()}`,
      description: `Embedding ${tokens} tok`,
      subjectType: options.subjectType ?? 'EMBED',
      subjectId: options.subjectId,
    })
  }

  return vec
}

// Cosine similarity — both vectors assumed normalized? OpenAI ada di unit sphere
// untuk text-embedding-3-*, jadi dot product = cosine. Tapi kita pakai full
// cosine formula untuk safe (kalau ada vector eksternal).
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Cosine dim mismatch: ${a.length} vs ${b.length}`)
  }
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0
    const bv = b[i] ?? 0
    dot += av * bv
    normA += av * av
    normB += bv * bv
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}
