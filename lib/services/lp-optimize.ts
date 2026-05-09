// LP AI Optimization service — orchestrate Sonnet call dengan context dari
// analytics + chat signals + current HTML, return suggestions + rewritten HTML.
//
// Cost charging dinamis: estimate dulu (untuk confirm dialog), execute kemudian.
// Token charge platform: ceil(providerCostRp × 1.3 / pricePerToken) → 30% margin.
// Charge dilakukan AKHIR (setelah AI sukses respond) supaya kalau gagal,
// user tidak dipotong.
import Anthropic from '@anthropic-ai/sdk'

import { getAnthropicClient } from '@/lib/anthropic'
import { prisma } from '@/lib/prisma'

// Haiku 4.5 — DEFAULT untuk LP optimization karena ~2-3x lebih cepat dari
// Sonnet (200-300 tok/sec vs 50-100) + 3x lebih murah ($1/$5 vs $3/$15).
// Quality drop kecil untuk HTML rewrite + simple suggestions; suitable untuk
// majority case. Switch ke Sonnet kalau butuh deep reasoning (Phase berikutnya
// add toggle "Quality mode" di UI).
export const OPTIMIZE_MODEL = 'claude-haiku-4-5'
const MODEL_INPUT_USD_PER_1M = 1
const MODEL_OUTPUT_USD_PER_1M = 5

// Estimasi token: rough rule chars/4 untuk Indonesian/English campuran.
const CHARS_PER_TOKEN = 4
// Output buffer: rewritten HTML ≈ input HTML × 1.0 + suggestions JSON ~2K char.
const OUTPUT_OVERHEAD_CHARS = 2000

// Margin untuk platform — 30% di atas provider cost.
const PLATFORM_MARGIN = 1.3
// Default fallback rates kalau setting kosong.
const DEFAULT_USD_RATE = 16_000
const DEFAULT_PRICE_PER_TOKEN_RP = 2

// Haiku output cap 12K token — cukup untuk LP biasa (HTML 5-15K char).
// Lebih kecil dari Sonnet (16K) supaya tidak inflated; output Haiku tetap
// stop saat selesai walau cap besar, jadi cap rendah TIDAK speed up
// legitimate output, hanya prevent runaway.
const MAX_OUTPUT_TOKENS = 12_000
// Haiku 4.5 untuk output 6-10K token realistic 25-60 detik. Cap 120s sebagai
// safety — kalau lebih, biasanya provider issue.
const AI_CALL_TIMEOUT_MS = 120_000

export interface CostEstimate {
  htmlChars: number
  contextChars: number
  estimatedInputTokens: number
  estimatedOutputTokens: number
  providerCostUsd: number
  providerCostRp: number
  platformTokensCharge: number
  platformChargeRp: number
  usdRate: number
  pricePerTokenRp: number
}

export async function estimateOptimizationCost(input: {
  htmlContent: string
  signalsCount: number
  hasAnalytics: boolean
}): Promise<CostEstimate> {
  const settings = await prisma.pricingSettings
    .findFirst({ select: { usdRate: true, pricePerToken: true } })
    .catch(() => null)
  const usdRate = settings?.usdRate ?? DEFAULT_USD_RATE
  const pricePerToken = settings?.pricePerToken ?? DEFAULT_PRICE_PER_TOKEN_RP

  const htmlChars = input.htmlContent.length
  // Context: signals (~150 char per signal) + analytics summary (~600 char)
  // + system prompt overhead (~1500 char).
  const contextChars =
    1500 +
    input.signalsCount * 150 +
    (input.hasAnalytics ? 600 : 0)

  const estimatedInputTokens = Math.ceil((htmlChars + contextChars) / CHARS_PER_TOKEN)
  const estimatedOutputTokens = Math.ceil(
    (htmlChars + OUTPUT_OVERHEAD_CHARS) / CHARS_PER_TOKEN,
  )

  const providerCostUsd =
    (estimatedInputTokens / 1_000_000) * MODEL_INPUT_USD_PER_1M +
    (estimatedOutputTokens / 1_000_000) * MODEL_OUTPUT_USD_PER_1M
  const providerCostRp = providerCostUsd * usdRate
  const platformChargeRp = providerCostRp * PLATFORM_MARGIN
  const platformTokensCharge = Math.max(
    100, // minimum 100 token supaya ada pricing floor (mencegah pajak terlalu kecil)
    Math.ceil(platformChargeRp / pricePerToken),
  )

  return {
    htmlChars,
    contextChars,
    estimatedInputTokens,
    estimatedOutputTokens,
    providerCostUsd,
    providerCostRp,
    platformTokensCharge,
    platformChargeRp: platformTokensCharge * pricePerToken,
    usdRate,
    pricePerTokenRp: pricePerToken,
  }
}

// ─────────────────────────────────────────
// Prompt building
// ─────────────────────────────────────────

const SYSTEM_PROMPT = `Kamu adalah expert Conversion Rate Optimization (CRO) + copywriter Indonesia. Tugasmu menganalisa landing page (HTML) berdasarkan data analytics + customer signals, lalu kasih perbaikan konkret.

ATURAN OUTPUT (WAJIB):
- Output HANYA JSON valid (mulai dari { sampai }), TIDAK ADA markdown, TIDAK ADA penjelasan di luar JSON.
- Schema:
  {
    "suggestions": [
      { "title": "...", "rationale": "...", "impact": "high|medium|low" }
    ],
    "focusAreas": ["pricing","social_proof","cta_clarity","value_prop","trust","urgency","mobile_ux"],
    "scoreBefore": <0-100>,
    "scoreAfter": <0-100>,
    "rewrittenHtml": "<!DOCTYPE html>...</html>"
  }
- Field 'suggestions' WAJIB 5-8 item, urut dari impact terbesar.
- Field 'rewrittenHtml' WAJIB lengkap dari <!DOCTYPE html> sampai </html>, semua perbaikan sudah di-apply.

ATURAN PERBAIKAN:
- Pertahankan struktur LP saat ini (warna, layout, gambar URL) — fokus copy & UX kecil, BUKAN redesign total.
- TIDAK boleh ganti URL gambar — pakai URL yang sudah ada.
- TIDAK boleh hapus section yang sudah ada — boleh tambah, edit copy, atau atur ulang urutan kecil.
- Kalau ada signal customer keberatan harga, TAMBAH section value/social-proof, JANGAN turunkan harga.
- Kalau ada signal "gak percaya", TAMBAH testimoni / garansi / trust badge.
- Kalau CTA click rate rendah, BUAT CTA lebih prominent (warna kontras, copy lebih kuat, posisi lebih atas).
- Bahasa Indonesia natural, hindari bahasa robotic.
- Layout tetap single-column vertikal mobile-first.

EVALUASI:
- scoreBefore = nilai 0-100 LP saat ini berdasarkan: copy strength, CTA clarity, social proof, trust, value prop, mobile UX.
- scoreAfter = estimasi setelah perbaikan diterapkan. Realistic — kenaikan 8-20 point wajar untuk single iteration.`

interface BuildPromptInput {
  htmlContent: string
  signals: Array<{ category: string; label: string; count: number; samples: string[] }>
  analytics: {
    visits: number
    ctaRate: number
    bounceRate: number
    avgTimeSec: number
    topCtas: Array<{ label: string; count: number }>
    deviceSplit: Array<{ key: string; count: number }>
    funnelDropAt: string | null // human-readable: "scroll 50%" or "klik CTA"
  } | null
}

function buildUserPrompt(input: BuildPromptInput): string {
  const lines: string[] = []
  lines.push('# HTML LANDING PAGE SAAT INI')
  lines.push(input.htmlContent.trim())
  lines.push('')

  if (input.analytics) {
    const a = input.analytics
    lines.push('# DATA ANALYTICS (30 hari terakhir)')
    lines.push(`- Total pengunjung: ${a.visits}`)
    lines.push(`- CTA click rate: ${a.ctaRate.toFixed(1)}%`)
    lines.push(`- Bounce rate: ${a.bounceRate.toFixed(1)}%`)
    lines.push(`- Avg time on page: ${Math.round(a.avgTimeSec)}s`)
    if (a.funnelDropAt) {
      lines.push(`- Funnel drop terbesar: di tahap "${a.funnelDropAt}"`)
    }
    if (a.topCtas.length > 0) {
      lines.push('- Top CTA yang diklik:')
      for (const c of a.topCtas.slice(0, 5)) {
        lines.push(`  • "${c.label}" (${c.count} klik)`)
      }
    }
    if (a.deviceSplit.length > 0) {
      lines.push(
        '- Device split: ' +
          a.deviceSplit
            .map((d) => `${d.key}=${d.count}`)
            .join(', '),
      )
    }
    lines.push('')
  } else {
    lines.push('# DATA ANALYTICS')
    lines.push('Belum ada data signifikan (LP baru atau traffic minim).')
    lines.push('')
  }

  if (input.signals.length > 0) {
    lines.push('# CUSTOMER SIGNALS DARI CHAT WA')
    for (const s of input.signals.slice(0, 5)) {
      lines.push(`## ${s.label} (${s.count} pesan)`)
      for (const q of s.samples.slice(0, 3)) {
        lines.push(`- "${q}"`)
      }
      lines.push('')
    }
  } else {
    lines.push('# CUSTOMER SIGNALS')
    lines.push('Belum ada signal customer dari chat (atau chat belum ter-record).')
    lines.push('')
  }

  lines.push('# TUGAS')
  lines.push(
    'Analisa LP di atas berdasarkan data analytics + customer signals. Berikan 5-8 saran perbaikan konkret + HTML versi baru yang sudah apply semua perbaikan. Output JSON sesuai schema.',
  )
  return lines.join('\n')
}

// ─────────────────────────────────────────
// Run optimization
// ─────────────────────────────────────────

export interface OptimizationOutput {
  suggestions: Array<{ title: string; rationale: string; impact: string }>
  focusAreas: string[]
  scoreBefore: number | null
  scoreAfter: number | null
  rewrittenHtml: string
  inputTokens: number
  outputTokens: number
  providerCostUsd: number
  providerCostRp: number
  platformTokensCharge: number
}

export async function runOptimization(input: BuildPromptInput): Promise<OptimizationOutput> {
  const userPrompt = buildUserPrompt(input)
  const client = getAnthropicClient()

  const stream = client.messages.stream({
    model: OPTIMIZE_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  })

  // Promise.race timeout — Sonnet kadang lambat untuk output panjang.
  const final = (await Promise.race([
    stream.finalMessage(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `AI optimization timeout setelah ${Math.round(AI_CALL_TIMEOUT_MS / 1000)} detik. Coba lagi — kalau berulang, kemungkinan provider sedang lambat.`,
            ),
          ),
        AI_CALL_TIMEOUT_MS,
      ),
    ),
  ])) as Anthropic.Messages.Message

  const raw = final.content
    .filter((b: Anthropic.ContentBlock): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()

  const inputTokens = final.usage.input_tokens
  const outputTokens = final.usage.output_tokens

  const parsed = parseOptimizationJson(raw)
  if (!parsed) {
    throw new Error('AI tidak mengembalikan JSON valid. Coba lagi atau hubungi admin.')
  }

  // Provider cost actual.
  const providerCostUsd =
    (inputTokens / 1_000_000) * MODEL_INPUT_USD_PER_1M +
    (outputTokens / 1_000_000) * MODEL_OUTPUT_USD_PER_1M
  const settings = await prisma.pricingSettings
    .findFirst({ select: { usdRate: true, pricePerToken: true } })
    .catch(() => null)
  const usdRate = settings?.usdRate ?? DEFAULT_USD_RATE
  const pricePerToken = settings?.pricePerToken ?? DEFAULT_PRICE_PER_TOKEN_RP
  const providerCostRp = providerCostUsd * usdRate
  const platformTokensCharge = Math.max(
    100,
    Math.ceil((providerCostRp * PLATFORM_MARGIN) / pricePerToken),
  )

  return {
    suggestions: parsed.suggestions,
    focusAreas: parsed.focusAreas,
    scoreBefore: parsed.scoreBefore,
    scoreAfter: parsed.scoreAfter,
    rewrittenHtml: parsed.rewrittenHtml,
    inputTokens,
    outputTokens,
    providerCostUsd,
    providerCostRp,
    platformTokensCharge,
  }
}

interface ParsedOpt {
  suggestions: Array<{ title: string; rationale: string; impact: string }>
  focusAreas: string[]
  scoreBefore: number | null
  scoreAfter: number | null
  rewrittenHtml: string
}

function parseOptimizationJson(raw: string): ParsedOpt | null {
  // Strip markdown fence kalau ada.
  let text = raw
  const fence = text.match(/^```(?:json|JSON)?\s*\n([\s\S]*?)\n```\s*$/)
  if (fence && fence[1]) text = fence[1].trim()

  let json: Record<string, unknown>
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    // Fallback: extract first { ... } block.
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return null
    try {
      json = JSON.parse(m[0]) as Record<string, unknown>
    } catch {
      return null
    }
  }

  const suggestions = Array.isArray(json.suggestions) ? json.suggestions : []
  const focusAreas = Array.isArray(json.focusAreas) ? json.focusAreas : []
  const html = typeof json.rewrittenHtml === 'string' ? json.rewrittenHtml.trim() : ''
  if (!html || !html.toLowerCase().includes('<html')) return null

  return {
    suggestions: suggestions
      .filter((s) => s && typeof s === 'object')
      .map((s) => {
        const obj = s as Record<string, unknown>
        return {
          title: typeof obj.title === 'string' ? obj.title.slice(0, 200) : '(tanpa judul)',
          rationale:
            typeof obj.rationale === 'string' ? obj.rationale.slice(0, 1000) : '',
          impact:
            typeof obj.impact === 'string' && ['high', 'medium', 'low'].includes(obj.impact)
              ? obj.impact
              : 'medium',
        }
      })
      .slice(0, 12),
    focusAreas: focusAreas
      .filter((f): f is string => typeof f === 'string')
      .map((f) => f.slice(0, 60))
      .slice(0, 10),
    scoreBefore: clampScoreOrNull(json.scoreBefore),
    scoreAfter: clampScoreOrNull(json.scoreAfter),
    rewrittenHtml: html,
  }
}

function clampScoreOrNull(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  return Math.max(0, Math.min(100, Math.round(v)))
}

// ─────────────────────────────────────────
// Versions helper — auto-prune keep last N.
// ─────────────────────────────────────────

const KEEP_LAST_VERSIONS = 20

export async function snapshotVersion(input: {
  lpId: string
  htmlContent: string
  source: 'manual' | 'ai' | 'restore'
  optimizationId?: string | null
  scoreSnapshot?: number | null
  note?: string | null
}): Promise<string> {
  const created = await prisma.lpVersion.create({
    data: {
      lpId: input.lpId,
      htmlContent: input.htmlContent,
      source: input.source,
      optimizationId: input.optimizationId ?? null,
      scoreSnapshot: input.scoreSnapshot ?? null,
      note: input.note ?? null,
    },
    select: { id: true },
  })

  // Best-effort prune — jangan gagalkan caller kalau prune error.
  prisma.lpVersion
    .findMany({
      where: { lpId: input.lpId },
      orderBy: { createdAt: 'desc' },
      skip: KEEP_LAST_VERSIONS,
      select: { id: true },
    })
    .then((toDelete) => {
      if (toDelete.length === 0) return
      return prisma.lpVersion.deleteMany({
        where: { id: { in: toDelete.map((v) => v.id) } },
      })
    })
    .catch((err) => console.error('[lp-optimize] version prune gagal:', err))

  return created.id
}
