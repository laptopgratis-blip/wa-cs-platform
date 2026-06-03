// Live room chat service — proses 1 user message:
//   1. Build context (system prompt + product list + history)
//   2. Call Claude (non-streaming untuk MVP — sederhana, reliable)
//   3. Split balasan jadi sentences
//   4. Deduct token via executeAiWithCharge (CS_REPLY key)
//
// PR-0b sengaja non-streaming. Streaming SSE bisa ditambah di PR-0c kalau
// latency UX dirasa kurang.

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

import {
  executeAiWithCharge,
  type ComputedCharge,
} from '@/lib/services/ai-generation-log'

import { getLiveApiKey } from './provider-keys'

export interface LiveProduct {
  id: string
  name: string
  price: number
  description: string | null
  imageUrl: string | null
  // Flash sale (Phase 4). Caller (api route) sudah validasi window + quota
  // sebelum kirim — jadi kalau flashSalePrice ada di sini, sudah PASTI aktif.
  flashSalePrice?: number | null
  flashSaleEndAt?: string | null // ISO untuk display ke Claude
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface LiveChatInput {
  ownerUserId: string // pemilik room (di-charge)
  roomId: string
  systemPromptBase: string // dari LiveRoom.systemPrompt (persona host)
  products: LiveProduct[]
  message: string
  history: ChatTurn[] // recent turns, caller batasi mis. 12 last
  // Per-room overrides — diisi handler dari LiveRoom fields.
  model?: string // 'claude-haiku-4-5' (default) | 'claude-sonnet-4-6'
  temperature?: number // 0-1, default 0.7
  // Identitas customer (dari login gate) — host akan sapa pakai nama ini.
  customerName?: string | null
}

// Pricing per 1M token untuk model yang didukung — supaya
// executeAiWithCharge bisa hitung biaya akurat saat user pilih model
// selain default Haiku.
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  // OpenAI
  'gpt-5-mini': { input: 0.25, output: 2.0 },
  'gpt-5': { input: 3.0, output: 15.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
}

function isOpenAiModel(model: string): boolean {
  return model.startsWith('gpt-')
}

export interface LiveChatOutput {
  reply: string
  sentences: string[]
  // Token info untuk billing transparency ke client.
  charge: ComputedCharge
}

const MODEL = 'claude-haiku-4-5'
const MAX_OUTPUT_TOKENS = 250 // 1-3 kalimat ID = ~150 token, 250 cap defensive
const MAX_HISTORY_TURNS = 8 // dari 12 → 8 (live shopping = singkat, gak butuh long ctx)
const FEATURE_KEY = 'CS_REPLY'

// Split per kalimat akhiran . ! ? — match pola Siska supaya TTS bisa
// di-queue per kalimat (latency rendah).
const SENTENCE_RE = /[^.!?]+[.!?]+|\S[^.!?]*$/g

export function splitIntoSentences(text: string): string[] {
  const matches = text.match(SENTENCE_RE) ?? []
  return matches
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function buildSystemPrompt(input: LiveChatInput): string {
  // Produk: trim description 200→100 char untuk save ~50% per produk.
  const productLines = input.products
    .map((p, idx) => {
      const onFlash = p.flashSalePrice != null && p.flashSalePrice < p.price
      const priceLabel = onFlash
        ? `Rp ${(p.flashSalePrice as number).toLocaleString('id-ID')} (FLASH dari Rp ${p.price.toLocaleString('id-ID')})`
        : `Rp ${p.price.toLocaleString('id-ID')}`
      return `${idx + 1}. ${p.name} — ${priceLabel}${
        p.description ? ` (${p.description.slice(0, 100)})` : ''
      }`
    })
    .join('\n')

  // Aturan compressed dari 8 → 5 (-53% char). Rule lama #6 dihapus (sudah ada
  // UI button). Rule #8 (nama preamble) dipadatkan dari 800→200 char.
  return [
    input.systemPromptBase.trim(),
    '',
    productLines ? `PRODUK:\n${productLines}` : '',
    '',
    'ATURAN:',
    '1. Host live shopping ID, casual 1-3 kalimat, no markdown/emoji (output di-TTS).',
    '2. Sebut produk PERSIS dari daftar di atas. Jangan invent. Kalau FLASH SALE, sebut harga promo + urgency natural.',
    '3. CTA WAJIB tiap balasan: arahkan customer "klik kartu produk di samping ya kak".',
    '4. Format pesan: "(Customer: <nama>) <pesan>" current, "(<nama>) <pesan>" history. Sapa nama dari pesan TERAKHIR (jangan nama viewer lama). Kalau anonim → "kak" atau "sis".',
  ]
    .filter(Boolean)
    .join('\n')
}

export async function generateLiveReply(
  input: LiveChatInput,
): Promise<LiveChatOutput> {
  const systemPrompt = buildSystemPrompt(input)
  const recentHistory = input.history.slice(-MAX_HISTORY_TURNS)
  // Prepend customer name ke message untuk konteks Claude.
  const customerLabel = input.customerName?.trim() || 'anonim'
  const userContent = `(Customer: ${customerLabel}) ${input.message}`
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...recentHistory.map((t) => ({ role: t.role, content: t.content })),
    { role: 'user' as const, content: userContent },
  ]

  // Estimasi token untuk pre-flight balance check.
  const inputChars =
    systemPrompt.length +
    messages.reduce((acc, m) => acc + m.content.length, 0)
  const estimateInputTokens = Math.ceil(inputChars / 3.5)
  const estimateOutputTokens = MAX_OUTPUT_TOKENS

  const selectedModel = input.model ?? MODEL
  const pricing = MODEL_PRICING[selectedModel] ?? MODEL_PRICING[MODEL]
  const temperature = Math.max(0, Math.min(1, input.temperature ?? 0.7))
  const useOpenAi = isOpenAiModel(selectedModel)

  const { result, charge } = await executeAiWithCharge({
    featureKey: FEATURE_KEY,
    userId: input.ownerUserId,
    ctx: {
      referencePrefix: `live_chat:${input.roomId}`,
      description: `Live chat — room ${input.roomId}`,
      subjectType: 'LIVE_ROOM',
      subjectId: input.roomId,
      estimateInputTokens,
      estimateOutputTokens,
      priceOverride: {
        modelName: selectedModel,
        inputPricePer1M: pricing.input,
        outputPricePer1M: pricing.output,
      },
      aiCall: async () => {
        if (useOpenAi) {
          // OpenAI Chat Completions — gpt-5-mini / gpt-5 / gpt-4o-mini.
          // GPT-5 family WAJIB pakai max_completion_tokens (bukan max_tokens lama)
          // + reasoning_effort=minimal supaya hemat hidden reasoning tokens.
          // GPT-5 juga gak terima temperature selain default (1.0) — set undefined.
          const apiKey = await getLiveApiKey('OPENAI')
          const openai = new OpenAI({ apiKey })
          const isGpt5 = selectedModel.startsWith('gpt-5')
          const body: Record<string, unknown> = {
            model: selectedModel,
            messages: [
              { role: 'system', content: systemPrompt },
              ...messages,
            ],
          }
          if (isGpt5) {
            body.max_completion_tokens = MAX_OUTPUT_TOKENS
            body.reasoning_effort = 'minimal'
            // GPT-5 reject custom temperature, biarkan default
          } else {
            body.max_tokens = MAX_OUTPUT_TOKENS
            body.temperature = temperature
          }
          // @ts-expect-error — OpenAI SDK type strict, dynamic body OK at runtime
          const oaRes = await openai.chat.completions.create(body)
          const text = oaRes.choices[0]?.message?.content?.trim() ?? ''
          return {
            result: text,
            inputTokens: oaRes.usage?.prompt_tokens ?? estimateInputTokens,
            outputTokens: oaRes.usage?.completion_tokens ?? Math.ceil(text.length / 3.5),
          }
        }
        // Anthropic Claude.
        const apiKey = await getLiveApiKey('ANTHROPIC')
        const client = new Anthropic({ apiKey })
        const res = await client.messages.create({
          model: selectedModel,
          max_tokens: MAX_OUTPUT_TOKENS,
          temperature,
          system: systemPrompt,
          messages,
        })
        const text = res.content
          .filter(
            (b: Anthropic.ContentBlock): b is Anthropic.TextBlock => b.type === 'text',
          )
          .map((b) => b.text)
          .join('')
          .trim()
        return {
          result: text,
          inputTokens: res.usage.input_tokens,
          outputTokens: res.usage.output_tokens,
        }
      },
    },
  })

  return {
    reply: result,
    sentences: splitIntoSentences(result),
    charge,
  }
}
