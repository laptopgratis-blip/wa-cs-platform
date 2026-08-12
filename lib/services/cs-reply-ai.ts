// Generator balasan CS AI — port dari wa-service/src/ai-handler.ts supaya
// pipeline Cloud API (di dalam Next.js) tidak perlu hop HTTP. Perbedaan satu-
// satunya: API key diambil langsung dari DB/env (lib/services/ai-api-key),
// bukan via endpoint internal.
//
// Perubahan perilaku di sini WAJIB disinkronkan dengan ai-handler.ts sampai
// wa-service pensiun.

import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI, type Content } from '@google/generative-ai'
import OpenAI from 'openai'

import { ApiKeyError, getAiApiKey, type CsAiProvider } from '@/lib/services/ai-api-key'

const MAX_TOKENS = 800
// GPT-5 family: `max_completion_tokens` dipakai BARENG reasoning token
// (invisible). Budget lebih besar khusus GPT-5 supaya reply tidak kosong.
const OPENAI_GPT5_MAX_TOKENS = 2500
const DEFAULT_MODEL_BY_PROVIDER: Record<CsAiProvider, string> = {
  ANTHROPIC: 'claude-haiku-4-5-20251001',
  OPENAI: 'gpt-5-mini',
  GOOGLE: 'gemini-2.0-flash',
}

export interface CsHistoryItem {
  role: string // USER | AI | HUMAN | AGENT
  content: string
}

export interface GenerateCsReplyInput {
  systemPrompt: string
  provider: CsAiProvider
  modelId?: string | null
  history: CsHistoryItem[]
  latestUserMessage: string
}

export interface CsAiUsage {
  inputTokens: number
  outputTokens: number
}

export interface GenerateCsReplyResult {
  ok: boolean
  reply?: string
  error?: string
  usage?: CsAiUsage
  // true kalau gagal karena API key tidak ada/invalid — caller pause sesi.
  invalidApiKey?: boolean
}

// Cache SDK client per provider — re-init kalau key berubah.
let cachedAnthropic: { client: Anthropic; key: string } | null = null
let cachedOpenai: { client: OpenAI; key: string } | null = null
let cachedGoogle: { client: GoogleGenerativeAI; key: string } | null = null

async function getAnthropic(): Promise<Anthropic> {
  const key = await getAiApiKey('ANTHROPIC')
  if (!cachedAnthropic || cachedAnthropic.key !== key) {
    cachedAnthropic = { client: new Anthropic({ apiKey: key }), key }
  }
  return cachedAnthropic.client
}

async function getOpenai(): Promise<OpenAI> {
  const key = await getAiApiKey('OPENAI')
  if (!cachedOpenai || cachedOpenai.key !== key) {
    cachedOpenai = { client: new OpenAI({ apiKey: key }), key }
  }
  return cachedOpenai.client
}

async function getGoogle(): Promise<GoogleGenerativeAI> {
  const key = await getAiApiKey('GOOGLE')
  if (!cachedGoogle || cachedGoogle.key !== key) {
    cachedGoogle = { client: new GoogleGenerativeAI(key), key }
  }
  return cachedGoogle.client
}

export async function generateCsReply(
  input: GenerateCsReplyInput,
): Promise<GenerateCsReplyResult> {
  try {
    if (input.provider === 'ANTHROPIC') return await replyViaAnthropic(input)
    if (input.provider === 'OPENAI') return await replyViaOpenai(input)
    if (input.provider === 'GOOGLE') return await replyViaGoogle(input)
    return { ok: false, error: `Provider tidak dikenal: ${input.provider}` }
  } catch (err) {
    if (err instanceof ApiKeyError) {
      return { ok: false, error: err.message, invalidApiKey: true }
    }
    const e = err as { status?: number; message?: string }
    return {
      ok: false,
      error: `AI error${e.status ? ` ${e.status}` : ''}: ${e.message ?? String(err)}`,
    }
  }
}

async function replyViaAnthropic(
  input: GenerateCsReplyInput,
): Promise<GenerateCsReplyResult> {
  const client = await getAnthropic()
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
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()

  if (!reply) {
    console.error(
      `[cs-reply-ai:anthropic] empty reply — stop_reason=${res.stop_reason}, model=${input.modelId}`,
    )
    return { ok: false, error: 'AI tidak mengembalikan teks' }
  }
  return {
    ok: true,
    reply,
    usage: {
      inputTokens: res.usage?.input_tokens ?? 0,
      outputTokens: res.usage?.output_tokens ?? 0,
    },
  }
}

async function replyViaOpenai(
  input: GenerateCsReplyInput,
): Promise<GenerateCsReplyResult> {
  const client = await getOpenai()
  const alternating = toAlternatingMessages(input.history, input.latestUserMessage)
  if (alternating.length === 0) {
    return { ok: false, error: 'tidak ada pesan untuk dikirim' }
  }

  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: input.systemPrompt },
    ...alternating,
  ]

  // GPT-5 family: reasoning_effort=minimal mengurangi reasoning token
  // invisible yang bikin balasan kosong/timeout.
  const modelId = input.modelId || DEFAULT_MODEL_BY_PROVIDER.OPENAI
  const isGpt5 = modelId.startsWith('gpt-5')
  const extraOpts: Record<string, unknown> = isGpt5
    ? { reasoning_effort: 'minimal' }
    : {}
  const res = await client.chat.completions.create({
    model: modelId,
    max_completion_tokens: isGpt5 ? OPENAI_GPT5_MAX_TOKENS : MAX_TOKENS,
    messages,
    ...extraOpts,
  })

  const choice = res.choices[0]
  const reply = choice?.message?.content?.trim() ?? ''
  if (!reply) {
    console.error(
      `[cs-reply-ai:openai] empty reply — finish_reason=${choice?.finish_reason}, model=${modelId}, reasoning_tokens=${res.usage?.completion_tokens_details?.reasoning_tokens}`,
    )
    return { ok: false, error: 'AI tidak mengembalikan teks' }
  }
  return {
    ok: true,
    reply,
    usage: {
      inputTokens: res.usage?.prompt_tokens ?? 0,
      outputTokens: res.usage?.completion_tokens ?? 0,
    },
  }
}

async function replyViaGoogle(
  input: GenerateCsReplyInput,
): Promise<GenerateCsReplyResult> {
  const client = await getGoogle()
  const alternating = toAlternatingMessages(input.history, input.latestUserMessage)
  if (alternating.length === 0) {
    return { ok: false, error: 'tidak ada pesan untuk dikirim' }
  }

  // Google: system instruction terpisah; role 'user'/'model'.
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
  const meta = res.response.usageMetadata
  return {
    ok: true,
    reply,
    usage: {
      inputTokens: meta?.promptTokenCount ?? 0,
      outputTokens: meta?.candidatesTokenCount ?? 0,
    },
  }
}

// Convert history (USER/AI/HUMAN/AGENT) jadi alternating user/assistant,
// pastikan pesan terakhir user. Pesan AGENT/HUMAN diberi label "[CS]: "
// supaya AI paham itu jawaban customer service manusia, bukan dirinya.
const MAX_HISTORY_TURNS = 20

function toAlternatingMessages(
  history: CsHistoryItem[],
  latestUserMessage: string,
): { role: 'user' | 'assistant'; content: string }[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = []
  const recent = history.slice(-MAX_HISTORY_TURNS)
  for (const m of recent) {
    const role: 'user' | 'assistant' = m.role === 'USER' ? 'user' : 'assistant'
    if (!m.content) continue
    const isCs = m.role === 'AGENT' || m.role === 'HUMAN'
    const text = isCs ? `[CS]: ${m.content}` : m.content
    // Hindari dua pesan beruntun dengan role sama — gabungkan.
    const last = out[out.length - 1]
    if (last && last.role === role) {
      last.content += `\n\n${text}`
    } else {
      out.push({ role, content: text })
    }
  }

  const last = out[out.length - 1]
  if (!last || last.role !== 'user') {
    out.push({ role: 'user', content: latestUserMessage })
  } else if (!last.content.endsWith(latestUserMessage)) {
    // Append (bukan replace) supaya konteks pesan user sebelumnya tak hilang.
    last.content += `\n\n${latestUserMessage}`
  }

  // Beberapa provider (Claude) butuh pesan pertama dari user.
  while (out.length > 0 && out[0]?.role !== 'user') {
    out.shift()
  }

  return out
}
