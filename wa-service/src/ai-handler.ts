// AI handler — terima pesan masuk, pilih provider berdasarkan field
// `provider` dari AiModel, panggil SDK yang sesuai, kembalikan teks balasan.
//
// Tidak menyentuh state Baileys / DB; semua I/O ke Next.js dilakukan caller
// (lihat wa-manager.ts).

import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI, type Content } from '@google/generative-ai'
import OpenAI from 'openai'

import type { InternalMessageHistoryItem } from './internal-api.js'

const MAX_TOKENS = 800
// Default model per provider — dipakai kalau modelId kosong (defensive).
const DEFAULT_MODEL_BY_PROVIDER: Record<Provider, string> = {
  ANTHROPIC: 'claude-haiku-4-5-20251001',
  OPENAI: 'gpt-5-mini',
  GOOGLE: 'gemini-2.0-flash',
}

export type Provider = 'ANTHROPIC' | 'OPENAI' | 'GOOGLE'

export interface GenerateReplyInput {
  systemPrompt: string
  provider: Provider
  modelId?: string | null
  history: InternalMessageHistoryItem[]
  // Pesan customer terbaru — kalau belum ada di `history`, akan ditambahkan.
  latestUserMessage: string
}

export interface GenerateReplyResult {
  ok: boolean
  reply?: string
  error?: string
}

// ─────────────────────────────────────────
// Lazy-init clients per provider — process.env baru valid setelah dotenv
// jalan di index.ts; jangan evaluate di top-level.
// ─────────────────────────────────────────

let cachedAnthropic: { client: Anthropic; key: string } | null = null
function getAnthropic(): { client: Anthropic; apiKey: string } {
  const apiKey = process.env.ANTHROPIC_API_KEY || ''
  if (cachedAnthropic && cachedAnthropic.key === apiKey) {
    return { client: cachedAnthropic.client, apiKey }
  }
  cachedAnthropic = { client: new Anthropic({ apiKey }), key: apiKey }
  return { client: cachedAnthropic.client, apiKey }
}

let cachedOpenai: { client: OpenAI; key: string } | null = null
function getOpenai(): { client: OpenAI; apiKey: string } {
  const apiKey = process.env.OPENAI_API_KEY || ''
  if (cachedOpenai && cachedOpenai.key === apiKey) {
    return { client: cachedOpenai.client, apiKey }
  }
  cachedOpenai = { client: new OpenAI({ apiKey }), key: apiKey }
  return { client: cachedOpenai.client, apiKey }
}

let cachedGoogle: { client: GoogleGenerativeAI; key: string } | null = null
function getGoogle(): { client: GoogleGenerativeAI; apiKey: string } {
  const apiKey = process.env.GOOGLE_AI_API_KEY || ''
  if (cachedGoogle && cachedGoogle.key === apiKey) {
    return { client: cachedGoogle.client, apiKey }
  }
  cachedGoogle = { client: new GoogleGenerativeAI(apiKey), key: apiKey }
  return { client: cachedGoogle.client, apiKey }
}

// ─────────────────────────────────────────
// Public entrypoint
// ─────────────────────────────────────────

export async function generateReply(
  input: GenerateReplyInput,
): Promise<GenerateReplyResult> {
  try {
    if (input.provider === 'ANTHROPIC') return await replyViaAnthropic(input)
    if (input.provider === 'OPENAI') return await replyViaOpenai(input)
    if (input.provider === 'GOOGLE') return await replyViaGoogle(input)
    return { ok: false, error: `Provider tidak dikenal: ${input.provider}` }
  } catch (err) {
    const e = err as { status?: number; message?: string }
    return {
      ok: false,
      error: `AI error${e.status ? ` ${e.status}` : ''}: ${e.message ?? String(err)}`,
    }
  }
}

// ─────────────────────────────────────────
// Provider implementations
// ─────────────────────────────────────────

async function replyViaAnthropic(
  input: GenerateReplyInput,
): Promise<GenerateReplyResult> {
  const { client, apiKey } = getAnthropic()
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY belum di-set' }

  const messages = toAlternatingMessages(input.history, input.latestUserMessage)
  if (messages.length === 0) {
    return { ok: false, error: 'tidak ada pesan untuk dikirim' }
  }

  const res = await client.messages.create({
    model: input.modelId || DEFAULT_MODEL_BY_PROVIDER.ANTHROPIC,
    max_tokens: MAX_TOKENS,
    system: input.systemPrompt,
    messages,
  })

  const reply = res.content
    .filter((b: Anthropic.ContentBlock): b is Anthropic.TextBlock => b.type === 'text')
    .map((b: Anthropic.TextBlock) => b.text)
    .join('')
    .trim()

  if (!reply) return { ok: false, error: 'AI tidak mengembalikan teks' }
  return { ok: true, reply }
}

async function replyViaOpenai(
  input: GenerateReplyInput,
): Promise<GenerateReplyResult> {
  const { client, apiKey } = getOpenai()
  if (!apiKey) return { ok: false, error: 'OPENAI_API_KEY belum di-set' }

  // OpenAI Chat Completions: pakai role 'system' + alternating user/assistant.
  const alternating = toAlternatingMessages(input.history, input.latestUserMessage)
  if (alternating.length === 0) {
    return { ok: false, error: 'tidak ada pesan untuk dikirim' }
  }

  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: input.systemPrompt },
    ...alternating,
  ]

  const res = await client.chat.completions.create({
    model: input.modelId || DEFAULT_MODEL_BY_PROVIDER.OPENAI,
    max_completion_tokens: MAX_TOKENS,
    messages,
  })

  const reply = res.choices[0]?.message?.content?.trim() ?? ''
  if (!reply) return { ok: false, error: 'AI tidak mengembalikan teks' }
  return { ok: true, reply }
}

async function replyViaGoogle(
  input: GenerateReplyInput,
): Promise<GenerateReplyResult> {
  const { client, apiKey } = getGoogle()
  if (!apiKey) return { ok: false, error: 'GOOGLE_AI_API_KEY belum di-set' }

  // Google: system instruction terpisah dari history. Role-nya 'user'/'model'
  // (bukan 'assistant'). Pakai startChat() supaya history dikelola SDK.
  const alternating = toAlternatingMessages(input.history, input.latestUserMessage)
  if (alternating.length === 0) {
    return { ok: false, error: 'tidak ada pesan untuk dikirim' }
  }

  // Pisahkan: pesan user terakhir = prompt sekarang, sisanya = history.
  const last = alternating[alternating.length - 1]
  if (!last || last.role !== 'user') {
    return { ok: false, error: 'pesan terakhir harus dari user' }
  }
  const historyForGemini: Content[] = alternating.slice(0, -1).map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }))

  const model = client.getGenerativeModel({
    model: input.modelId || DEFAULT_MODEL_BY_PROVIDER.GOOGLE,
    systemInstruction: input.systemPrompt,
    generationConfig: { maxOutputTokens: MAX_TOKENS },
  })

  const chat = model.startChat({ history: historyForGemini })
  const res = await chat.sendMessage(last.content)
  const reply = res.response.text().trim()
  if (!reply) return { ok: false, error: 'AI tidak mengembalikan teks' }
  return { ok: true, reply }
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

// Convert history (USER/AI/HUMAN) jadi format alternating user/assistant,
// lalu pastikan pesan terakhir adalah user (latestUserMessage).
// Format ini netral — masing-masing provider tinggal map role-nya.
function toAlternatingMessages(
  history: InternalMessageHistoryItem[],
  latestUserMessage: string,
): { role: 'user' | 'assistant'; content: string }[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = []

  for (const m of history) {
    const role: 'user' | 'assistant' = m.role === 'USER' ? 'user' : 'assistant'
    if (!m.content) continue
    // Hindari dua pesan beruntun dengan role sama — gabungkan.
    const last = out[out.length - 1]
    if (last && last.role === role) {
      last.content += `\n\n${m.content}`
    } else {
      out.push({ role, content: m.content })
    }
  }

  // Pastikan pesan terakhir adalah user dengan latestUserMessage.
  const last = out[out.length - 1]
  if (!last || last.role !== 'user') {
    out.push({ role: 'user', content: latestUserMessage })
  } else if (!last.content.endsWith(latestUserMessage)) {
    last.content = latestUserMessage
  }

  // Beberapa provider (Claude) butuh pesan pertama dari user. Buang prefix
  // assistant kalau ada.
  while (out.length > 0 && out[0]?.role !== 'user') {
    out.shift()
  }

  return out
}
