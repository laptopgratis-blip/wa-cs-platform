// Research harga API terkini via Claude web_search tool, validasi JSON, diff
// dengan AiModelPreset table di DB. Function ini async-long: dipanggil
// background dari route, status di-track via PricingResearchLog row.
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

import { decrypt } from '@/lib/crypto'
import { prisma } from '@/lib/prisma'
import { syncFeatureConfigsFromPreset } from '@/lib/services/ai-feature-sync'

const RESEARCH_MODEL = 'claude-sonnet-4-5'
// Cap tinggi karena hasil research bisa panjang (multi-call web_search +
// JSON output).
const MAX_TOKENS = 8000

const PROMPT = `Cari harga API resmi terkini untuk semua model AI berikut dari sumber resmi.

Sumber resmi:
- https://www.anthropic.com/pricing
- https://openai.com/api/pricing
- https://ai.google.dev/pricing

Models yang harus dicari:
ANTHROPIC: claude-opus-4-5, claude-sonnet-4-5, claude-haiku-4-5
OPENAI: gpt-5, gpt-5-mini, gpt-4.1, gpt-4o, gpt-4o-mini
GOOGLE: gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite

Return HANYA JSON array berikut format ini, tanpa markdown atau penjelasan tambahan:
[
  {
    "provider": "ANTHROPIC",
    "modelId": "claude-haiku-4-5",
    "displayName": "Claude Haiku 4.5",
    "inputPricePer1M": 1.0,
    "outputPricePer1M": 5.0,
    "contextWindow": 200000,
    "sourceUrl": "https://www.anthropic.com/pricing",
    "notes": "harga resmi per Mei 2026"
  }
]

Untuk model yang tidak ditemukan harganya, skip jangan dimasukkan.
Pastikan harga dalam USD per 1 juta token.`

const itemSchema = z.object({
  provider: z.enum(['ANTHROPIC', 'OPENAI', 'GOOGLE']),
  modelId: z.string().min(1).max(120),
  displayName: z.string().min(1).max(200),
  inputPricePer1M: z.number().nonnegative().max(10_000),
  outputPricePer1M: z.number().nonnegative().max(10_000),
  contextWindow: z.number().int().positive().max(10_000_000).optional().nullable(),
  sourceUrl: z.string().url().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
})

export type ResearchItem = z.infer<typeof itemSchema>

export interface DiffEntry {
  modelId: string
  action: 'add' | 'update' | 'unchanged'
  before?: { inputPricePer1M: number; outputPricePer1M: number }
  after: ResearchItem
  // Generated id (preset.id existing atau baru kalau add) untuk apply step.
  presetId?: string
}

export interface ResearchOutcome {
  status: 'SUCCESS' | 'FAILED'
  added: DiffEntry[]
  updated: DiffEntry[]
  unchanged: DiffEntry[]
  rawResponse?: string
  error?: string
}

// Ambil API key Anthropic dari ApiKey table (decrypt) — single source of
// truth, bukan env. Throw kalau belum di-set.
async function getAnthropicKey(): Promise<string> {
  const row = await prisma.apiKey.findUnique({
    where: { provider: 'ANTHROPIC' },
  })
  if (!row) {
    throw new Error('API key Anthropic belum di-set di /admin/api-keys')
  }
  if (!row.isActive) {
    throw new Error('API key Anthropic non-aktif. Cek /admin/api-keys.')
  }
  return decrypt(row.apiKey)
}

// Extract text dari content blocks (skip server_tool_use / web_search_results).
function extractFinalText(message: Anthropic.Message): string {
  return message.content
    .filter(
      (b): b is Anthropic.TextBlock =>
        (b as { type?: string }).type === 'text',
    )
    .map((b) => b.text)
    .join('\n')
    .trim()
}

// Parse JSON dari respons Claude. Kadang Claude membungkus dengan ```json
// markdown walaupun di-prompt jangan — strip markdown fence kalau ada.
function parseJsonArray(raw: string): unknown {
  let text = raw.trim()
  // Hapus fence ```json ... ```
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  if (fence) text = fence[1] ?? text
  // Cari array pertama saja (kalau Claude tetap nambah preamble).
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start >= 0 && end > start) text = text.slice(start, end + 1)
  return JSON.parse(text)
}

// Main entry. Caller (API route) sudah create PricingResearchLog row dengan
// status='RUNNING'; function ini update status ke SUCCESS/FAILED + isi diff.
export async function runResearch(logId: string): Promise<ResearchOutcome> {
  let outcome: ResearchOutcome = {
    status: 'FAILED',
    added: [],
    updated: [],
    unchanged: [],
  }

  try {
    const apiKey = await getAnthropicKey()
    const client = new Anthropic({ apiKey })

    const message = await client.messages.create({
      model: RESEARCH_MODEL,
      max_tokens: MAX_TOKENS,
      // Web search tool — biarkan Claude jelajah sumber resmi.
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 6,
        } as unknown as Anthropic.Messages.Tool,
      ],
      messages: [{ role: 'user', content: PROMPT }],
    })

    const text = extractFinalText(message)
    let parsed: unknown
    try {
      parsed = parseJsonArray(text)
    } catch (err) {
      throw new Error(
        `JSON parse gagal: ${(err as Error).message}. Raw: ${text.slice(0, 300)}`,
      )
    }

    if (!Array.isArray(parsed)) {
      throw new Error('Response Claude bukan array JSON')
    }

    // Validate setiap item; collect yang valid, log yang invalid.
    const items: ResearchItem[] = []
    for (const raw of parsed) {
      const r = itemSchema.safeParse(raw)
      if (r.success) items.push(r.data)
      else {
        console.warn(
          '[ai-pricing-research] item invalid, skip:',
          JSON.stringify(raw).slice(0, 200),
          r.error.issues[0]?.message,
        )
      }
    }

    if (items.length === 0) {
      throw new Error(
        'Tidak ada item valid dari Claude. Cek raw response di log.',
      )
    }

    // Diff terhadap DB.
    const existing = await prisma.aiModelPreset.findMany()
    const existingByModelId = new Map(existing.map((p) => [p.modelId, p]))

    const added: DiffEntry[] = []
    const updated: DiffEntry[] = []
    const unchanged: DiffEntry[] = []

    for (const item of items) {
      const ex = existingByModelId.get(item.modelId)
      if (!ex) {
        added.push({ modelId: item.modelId, action: 'add', after: item })
        continue
      }
      const sameInput = ex.inputPricePer1M === item.inputPricePer1M
      const sameOutput = ex.outputPricePer1M === item.outputPricePer1M
      if (sameInput && sameOutput) {
        unchanged.push({
          modelId: item.modelId,
          action: 'unchanged',
          presetId: ex.id,
          after: item,
        })
      } else {
        updated.push({
          modelId: item.modelId,
          action: 'update',
          presetId: ex.id,
          before: {
            inputPricePer1M: ex.inputPricePer1M,
            outputPricePer1M: ex.outputPricePer1M,
          },
          after: item,
        })
      }
    }

    outcome = {
      status: 'SUCCESS',
      added,
      updated,
      unchanged,
      rawResponse: text,
    }

    await prisma.pricingResearchLog.update({
      where: { id: logId },
      data: {
        status: 'SUCCESS',
        modelsAdded: added.length,
        modelsUpdated: updated.length,
        rawResponse: text,
        diff: { added, updated, unchanged } as object,
        completedAt: new Date(),
      },
    })

    return outcome
  } catch (err) {
    const errMsg = (err as Error).message ?? String(err)
    outcome = {
      status: 'FAILED',
      added: [],
      updated: [],
      unchanged: [],
      error: errMsg,
    }
    await prisma.pricingResearchLog
      .update({
        where: { id: logId },
        data: {
          status: 'FAILED',
          error: errMsg,
          completedAt: new Date(),
        },
      })
      .catch((e) =>
        console.error('[ai-pricing-research] gagal update log:', e),
      )
    return outcome
  }
}

// Apply diff entries yang admin pilih.
export async function applyChanges(
  selectedIds: string[],
  logId: string,
): Promise<{ applied: number }> {
  const log = await prisma.pricingResearchLog.findUnique({
    where: { id: logId },
  })
  if (!log || !log.diff) return { applied: 0 }

  // Build map dari diff: modelId → entry untuk lookup cepat.
  const diff = log.diff as unknown as {
    added: DiffEntry[]
    updated: DiffEntry[]
    unchanged: DiffEntry[]
  }
  const byModelId = new Map<string, DiffEntry>()
  for (const e of [...diff.added, ...diff.updated]) {
    byModelId.set(e.modelId, e)
  }

  let applied = 0
  // Track modelIds yg di-apply, lalu trigger sync ke AiFeatureConfig sekali
  // di akhir (per modelId, dedupe). Tidak fail kalau sync error — preset
  // sudah ter-update tetap valid.
  const touchedModelIds = new Set<string>()

  for (const modelId of selectedIds) {
    const e = byModelId.get(modelId)
    if (!e) continue
    if (e.action === 'add') {
      await prisma.aiModelPreset.create({
        data: {
          provider: e.after.provider,
          modelId: e.after.modelId,
          displayName: e.after.displayName,
          inputPricePer1M: e.after.inputPricePer1M,
          outputPricePer1M: e.after.outputPricePer1M,
          contextWindow: e.after.contextWindow ?? null,
          notes: e.after.notes ?? null,
          lastUpdatedSource: 'ai-research',
          lastUpdatedAt: new Date(),
        },
      })
      touchedModelIds.add(e.after.modelId)
      applied++
    } else if (e.action === 'update' && e.presetId) {
      await prisma.aiModelPreset.update({
        where: { id: e.presetId },
        data: {
          inputPricePer1M: e.after.inputPricePer1M,
          outputPricePer1M: e.after.outputPricePer1M,
          displayName: e.after.displayName,
          contextWindow: e.after.contextWindow ?? null,
          notes: e.after.notes ?? null,
          lastUpdatedSource: 'ai-research',
          lastUpdatedAt: new Date(),
        },
      })
      touchedModelIds.add(e.after.modelId)
      applied++
    }
  }

  // Trigger sync ke AiFeatureConfig — non-fatal kalau gagal.
  for (const mid of touchedModelIds) {
    try {
      await syncFeatureConfigsFromPreset(mid)
    } catch (err) {
      console.warn('[applyChanges] sync feature configs gagal:', mid, err)
    }
  }

  return { applied }
}
