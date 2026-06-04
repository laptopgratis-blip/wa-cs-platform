// Clip suggester — analyze transcript dari Whisper, kasih saran:
//   - category (GREETING | PRODUCT_DEMO | PRICE | OBJECTION | CLOSING | IDLE | GENERAL)
//   - summary (1 line ringkasan untuk display di card)
//   - tags (3-5 keyword penting)
//
// Dipakai setelah admin upload → owner approve/edit suggested → save.
//
// Model: Claude Haiku 4.5 (cepat + cheap, ~$0.001/call).

import Anthropic from '@anthropic-ai/sdk'

import { getLiveApiKey } from '@/lib/services/live/provider-keys'

const MODEL = 'claude-haiku-4-5'
const MAX_TOKENS = 600

const SYSTEM_PROMPT = `You are an analyst for live-shopping clip library. Input: transcript Indonesian dari rekaman host live (5-30 detik). Output: JSON dengan saran categorisasi.

Output JSON ONLY antara marker BEGIN_JSON dan END_JSON. Schema:
{
  "category": "GREETING" | "PRODUCT_DEMO" | "PRICE" | "OBJECTION" | "CLOSING" | "IDLE" | "GENERAL",
  "summary": string (1 kalimat singkat, max 80 char, ringkas konteks transcript),
  "tags": [string array, 3-5 keyword penting dari transcript, lowercase, dipakai untuk filter library]
}

Category guide:
- GREETING: sapaan pembuka ("halo kak", "selamat datang", "welcome")
- PRODUCT_DEMO: jelasin fitur/manfaat produk specific
- PRICE: jawab harga, diskon, paket
- OBJECTION: handle keberatan ("mahal", "mikir dulu", "harus konsul")
- CLOSING: ajakan checkout ("yuk order", "klik link", "buruan habis")
- IDLE: pengisi waktu sepi (gak ada konten penting, mostly diam atau senyum)
- GENERAL: campuran / sulit kategorisasi spesifik

Pilih kategori paling DOMINAN di transcript. Kalau ragu antara 2, pilih yang lebih spesifik.`

interface ClipSuggestion {
  category: string
  summary: string
  tags: string[]
}

function parseJsonBetweenMarkers(raw: string): unknown {
  const beginIdx = raw.indexOf('BEGIN_JSON')
  const endIdx = raw.indexOf('END_JSON')
  let jsonStr = raw
  if (beginIdx >= 0 && endIdx > beginIdx) {
    jsonStr = raw.slice(beginIdx + 'BEGIN_JSON'.length, endIdx).trim()
  }
  jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  return JSON.parse(jsonStr)
}

export async function suggestClipMetadata(transcript: string): Promise<ClipSuggestion> {
  const text = transcript.trim()
  if (!text) throw new Error('Transcript kosong')

  const apiKey = await getLiveApiKey('ANTHROPIC')
  const client = new Anthropic({ apiKey })

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Transcript:\n"${text.slice(0, 2000)}"\n\nOutput JSON sesuai schema antara marker BEGIN_JSON dan END_JSON.`,
      },
    ],
  })

  const raw = res.content
    .filter((b: Anthropic.ContentBlock): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()

  let parsed: unknown
  try {
    parsed = parseJsonBetweenMarkers(raw)
  } catch (e) {
    throw new Error(`Suggester response bukan JSON: ${(e as Error).message}`)
  }

  const suggestion = parsed as ClipSuggestion
  if (!suggestion.category) suggestion.category = 'GENERAL'
  if (!suggestion.summary) suggestion.summary = text.slice(0, 80)
  if (!Array.isArray(suggestion.tags)) suggestion.tags = []

  return suggestion
}
