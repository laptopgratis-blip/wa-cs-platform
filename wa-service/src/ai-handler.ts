// AI handler — terima pesan masuk, panggil Claude dengan system prompt
// dari soul + history percakapan, kembalikan teks balasan.
//
// Tidak menyentuh state Baileys / DB; semua I/O ke Next.js dilakukan
// caller (lihat wa-manager.ts).

import Anthropic from '@anthropic-ai/sdk'

import type { InternalMessageHistoryItem } from './internal-api.js'

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 800

// Lazy init — process.env baru valid setelah dotenv jalan di index.ts.
// Kalau kita evaluate di top-level, apiKey akan kosong saat module load.
let cachedClient: Anthropic | null = null
let cachedKey = ''
function getClient(): { client: Anthropic; apiKey: string } {
  const apiKey = process.env.ANTHROPIC_API_KEY || ''
  if (cachedClient && cachedKey === apiKey) {
    return { client: cachedClient, apiKey }
  }
  cachedClient = new Anthropic({ apiKey })
  cachedKey = apiKey
  return { client: cachedClient, apiKey }
}

export interface GenerateReplyInput {
  systemPrompt: string
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

export async function generateReply(
  input: GenerateReplyInput,
): Promise<GenerateReplyResult> {
  const { client, apiKey } = getClient()
  if (!apiKey) {
    return { ok: false, error: 'ANTHROPIC_API_KEY belum di-set' }
  }

  // Susun array messages untuk Claude. Format alternating user/assistant
  // sesuai requirement Anthropic: pesan pertama harus dari user.
  const messages = toClaudeMessages(input.history, input.latestUserMessage)
  if (messages.length === 0) {
    return { ok: false, error: 'tidak ada pesan untuk dikirim' }
  }

  try {
    const res = await client.messages.create({
      model: input.modelId || DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      system: input.systemPrompt,
      messages,
    })

    // Ambil teks dari content blocks (cuma ambil yang type=text).
    const reply = res.content
      .filter((block: Anthropic.ContentBlock): block is Anthropic.TextBlock => block.type === 'text')
      .map((b: Anthropic.TextBlock) => b.text)
      .join('')
      .trim()

    if (!reply) {
      return { ok: false, error: 'AI tidak mengembalikan teks' }
    }
    return { ok: true, reply }
  } catch (err) {
    const e = err as { status?: number; message?: string }
    return {
      ok: false,
      error: `AI error${e.status ? ` ${e.status}` : ''}: ${e.message ?? String(err)}`,
    }
  }
}

// Convert history (USER/AI/HUMAN) jadi format Claude (user/assistant), lalu
// tambah pesan customer terbaru di akhir. AI dan HUMAN dianggap "assistant"
// karena keduanya datang dari sisi bisnis.
function toClaudeMessages(
  history: InternalMessageHistoryItem[],
  latestUserMessage: string,
): { role: 'user' | 'assistant'; content: string }[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = []

  for (const m of history) {
    const role: 'user' | 'assistant' = m.role === 'USER' ? 'user' : 'assistant'
    // Skip pesan kosong (defensive).
    if (!m.content) continue
    // Hindari dua pesan beruntun dengan role sama — gabungkan.
    const last = out[out.length - 1]
    if (last && last.role === role) {
      last.content += `\n\n${m.content}`
    } else {
      out.push({ role, content: m.content })
    }
  }

  // Pastikan pesan terakhir di array adalah user. History sudah include
  // pesan customer terbaru (kita simpan sebelum panggil AI), jadi cek dulu.
  const last = out[out.length - 1]
  if (!last || last.role !== 'user') {
    out.push({ role: 'user', content: latestUserMessage })
  } else if (!last.content.endsWith(latestUserMessage)) {
    // Pesan terbaru belum termasuk → tambahkan.
    last.content = latestUserMessage
  }

  // Claude butuh pesan pertama dari user. Kalau history dimulai dengan
  // assistant (mis. AI greet duluan), buang prefix sampai ketemu user.
  while (out.length > 0 && out[0]?.role !== 'user') {
    out.shift()
  }

  return out
}
