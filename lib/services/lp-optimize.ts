// LP AI Optimization service — orchestrate AI call dengan context dari
// analytics + chat signals + current HTML, return suggestions + rewritten HTML.
//
// Pricing: pakai featureKey 'LP_OPTIMIZE' di AiFeatureConfig (admin-tunable).
// Charge dilakukan via executeAiWithCharge di route handler — service ini
// fokus ke AI call + parsing saja.
import Anthropic from '@anthropic-ai/sdk'

import { getAnthropicClient } from '@/lib/anthropic'
import { prisma } from '@/lib/prisma'
import { estimateCharge } from '@/lib/services/ai-generation-log'
import { getAiFeatureConfig } from '@/lib/services/ai-feature-config'

const LP_OPTIMIZE_FEATURE_KEY = 'LP_OPTIMIZE'

// Default fallback kalau AiFeatureConfig belum di-seed (defensive).
export const OPTIMIZE_MODEL = 'claude-haiku-4-5'

// Estimasi token: rough rule chars/4 untuk Indonesian/English campuran.
const CHARS_PER_TOKEN = 4
// Output buffer: rewritten HTML ≈ input HTML × 1.0 + suggestions JSON ~2K char.
const OUTPUT_OVERHEAD_CHARS = 2000

// Haiku output dynamic cap — Haiku 4.5 support up to 64K output token.
// Floor 32K supaya LP kecil/sedang tetap punya breathing room generous,
// ceiling 60K (sisa 4K safety vs hard limit). Multiplier ×2.0 vs input HTML
// untuk ruang ekspansi (AI sering tambah section testimoni/social-proof per
// CRO advice). max_tokens hanya safety cap — TIDAK mempengaruhi cost karena
// charged by actual usage; setting tinggi murni mencegah truncation.
const MIN_OUTPUT_TOKENS = 32_000
const MAX_OUTPUT_TOKENS = 60_000
const OUTPUT_MULTIPLIER = 2.0
// Output 30-50K token di Haiku ~150-250 detik. Cap 280s sebagai safety —
// route maxDuration 300s.
const AI_CALL_TIMEOUT_MS = 280_000

// Anthropic context window untuk Haiku 4.5 = 200K token. Sisakan 20K headroom
// untuk system prompt + analytics + signals. Kalau estimasi input > batas ini
// tolak DI MUKA dengan pesan ramah supaya user tahu masalahnya (bukan generic
// "AI service error 400").
const MAX_INPUT_TOKENS_HARD_LIMIT = 180_000

// ─────────────────────────────────────────
// Base64 image stripping
// LP user kadang punya <img src="data:image/...;base64,..."> inline yg
// ukurannya ratusan KB per gambar. Untuk AI optimization, isi pixel base64
// tidak relevan — yang penting struktur HTML + ada image di posisi tertentu.
// Strategi: replace setiap data URI base64 dengan placeholder pendek sebelum
// kirim ke AI; restore dari map setelah AI return. Placeholder format valid
// data: URI supaya AI patuh aturan "TIDAK boleh ganti URL gambar".
// ─────────────────────────────────────────

const BASE64_IMG_RE = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g
const PLACEHOLDER_RE = /data:image\/png;base64,LP_BASE64_PLACEHOLDER_(\d+)_END/g

export function stripBase64ImagesForPrompt(html: string): {
  stripped: string
  map: string[]
} {
  const map: string[] = []
  const stripped = html.replace(BASE64_IMG_RE, (m) => {
    const idx = map.length
    map.push(m)
    return `data:image/png;base64,LP_BASE64_PLACEHOLDER_${idx}_END`
  })
  return { stripped, map }
}

export function restoreBase64Images(html: string, map: string[]): string {
  return html.replace(PLACEHOLDER_RE, (full, idx) => {
    const i = Number(idx)
    return map[i] ?? full
  })
}

export interface CostEstimate {
  htmlChars: number
  originalHtmlChars: number
  base64ImagesStripped: number
  contextChars: number
  estimatedInputTokens: number
  estimatedOutputTokens: number
  providerCostUsd: number
  providerCostRp: number
  platformTokensCharge: number
  platformChargeRp: number
  usdRate: number
  pricePerTokenRp: number
  exceedsContextLimit: boolean
  contextLimitMessage?: string
}

export async function estimateOptimizationCost(input: {
  htmlContent: string
  signalsCount: number
  hasAnalytics: boolean
}): Promise<CostEstimate> {
  // Strip base64 image dulu — itulah yang akan benar2 dikirim ke AI.
  const originalHtmlChars = input.htmlContent.length
  const { stripped, map } = stripBase64ImagesForPrompt(input.htmlContent)
  const htmlChars = stripped.length
  // Context: signals (~150 char per signal) + analytics summary (~600 char)
  // + system prompt overhead (~1500 char).
  const contextChars =
    1500 +
    input.signalsCount * 150 +
    (input.hasAnalytics ? 600 : 0)

  const estimatedInputTokens = Math.ceil((htmlChars + contextChars) / CHARS_PER_TOKEN)
  // Output expansion realistic ×1.5 (kompromi antara compact rewrite dan
  // ambitious rewrite).
  const estimatedOutputTokens = Math.ceil(
    (htmlChars * 1.5 + OUTPUT_OVERHEAD_CHARS) / CHARS_PER_TOKEN,
  )

  const exceedsContextLimit = estimatedInputTokens > MAX_INPUT_TOKENS_HARD_LIMIT
  const contextLimitMessage = exceedsContextLimit
    ? `LP terlalu besar untuk AI optimization (~${estimatedInputTokens.toLocaleString('id-ID')} token, batas ${MAX_INPUT_TOKENS_HARD_LIMIT.toLocaleString('id-ID')}). Coba kurangi panjang HTML atau hapus konten yg tidak perlu.`
    : undefined

  // Hitung charge via skema unified (margin/floor/cap dari AiFeatureConfig).
  const charge = await estimateCharge({
    featureKey: LP_OPTIMIZE_FEATURE_KEY,
    estimatedInputTokens,
    estimatedOutputTokens,
  })

  return {
    htmlChars,
    originalHtmlChars,
    base64ImagesStripped: map.length,
    contextChars,
    estimatedInputTokens,
    estimatedOutputTokens,
    providerCostUsd: charge.apiCostUsd,
    providerCostRp: charge.apiCostRp,
    platformTokensCharge: charge.tokensCharged,
    platformChargeRp: charge.revenueRp,
    usdRate: charge.pricingSnapshot.usdRate,
    pricePerTokenRp: charge.pricingSnapshot.pricePerToken,
    exceedsContextLimit,
    contextLimitMessage,
  }
}

// ─────────────────────────────────────────
// Prompt building
// ─────────────────────────────────────────

// Output marker — pakai pattern yang TIDAK akan muncul di HTML user (triple-
// angle bracket + uppercase keyword). Format dua section supaya HTML TIDAK
// perlu di-escape sebagai JSON string (hemat ~10-15% token + parsing lebih
// reliable, tidak bisa gagal karena escape salah).
const META_BEGIN = '<<<LP_META>>>'
const META_END = '<<<LP_META_END>>>'
const HTML_BEGIN = '<<<LP_HTML>>>'
const HTML_END = '<<<LP_HTML_END>>>'

const SYSTEM_PROMPT = `Kamu adalah expert Conversion Rate Optimization (CRO) + copywriter Indonesia. Tugasmu menganalisa landing page (HTML) berdasarkan data analytics + customer signals, lalu kasih perbaikan konkret.

FORMAT OUTPUT (WAJIB DIIKUTI PERSIS):
Output HARUS dalam DUA section dengan marker. TIDAK ADA penjelasan/markdown di luar marker. Format:

${META_BEGIN}
{
  "suggestions": [
    { "title": "...", "rationale": "...", "impact": "high|medium|low" }
  ],
  "focusAreas": ["pricing","social_proof","cta_clarity","value_prop","trust","urgency","mobile_ux"],
  "scoreBefore": 50,
  "scoreAfter": 70
}
${META_END}

${HTML_BEGIN}
<!DOCTYPE html>
<html>
... HTML rewrite LENGKAP, plain (TIDAK perlu escape \\n atau \\") ...
</html>
${HTML_END}

ATURAN OUTPUT:
- META section harus JSON valid (parse-able dengan JSON.parse).
- HTML section LANGSUNG plain HTML — JANGAN bungkus quote, JANGAN escape newline atau quote.
- 'suggestions' WAJIB 5-8 item, urut dari impact terbesar.
- HTML WAJIB lengkap dari <!DOCTYPE html> sampai </html>.
- TIDAK ADA teks tambahan sebelum ${META_BEGIN} atau setelah ${HTML_END}.

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
    `Analisa LP di atas berdasarkan data analytics + customer signals. Berikan 5-8 saran perbaikan konkret + HTML versi baru yang sudah apply semua perbaikan. Output dalam format dua section (${META_BEGIN}…${META_END} dan ${HTML_BEGIN}…${HTML_END}) sesuai instruksi system prompt.`,
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
}

export async function runOptimization(input: BuildPromptInput): Promise<OptimizationOutput> {
  // Strip base64 image inline supaya tidak boros context — AI tidak butuh
  // pixel data untuk optimasi struktur LP.
  const { stripped: strippedHtml, map: base64Map } = stripBase64ImagesForPrompt(
    input.htmlContent,
  )

  // Pre-flight context check — kalau bahkan setelah strip masih melebihi
  // batas, throw user-friendly error sebelum panggil API.
  const approxInputTokens = Math.ceil(strippedHtml.length / CHARS_PER_TOKEN) + 500
  if (approxInputTokens > MAX_INPUT_TOKENS_HARD_LIMIT) {
    throw new Error(
      `LP terlalu besar untuk AI optimization (~${approxInputTokens.toLocaleString('id-ID')} token, batas ${MAX_INPUT_TOKENS_HARD_LIMIT.toLocaleString('id-ID')}). Coba pecah jadi LP lebih kecil atau kurangi konten.`,
    )
  }

  const userPrompt = buildUserPrompt({ ...input, htmlContent: strippedHtml })
  const client = getAnthropicClient()
  const model = await getOptimizeModel()

  // Dynamic output budget. AI sering ekspansi HTML 1.2-1.8x (tambah testimoni,
  // social-proof per CRO advice). Multiplier ×2 + 5K marker/meta overhead +
  // floor MIN_OUTPUT_TOKENS supaya LP kecil tetap aman. Clamp ke
  // [MIN_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS] (Haiku 4.5 hard cap 64K).
  const expectedOutputChars =
    strippedHtml.length * OUTPUT_MULTIPLIER + OUTPUT_OVERHEAD_CHARS + 5000
  const dynamicMaxOutput = Math.min(
    MAX_OUTPUT_TOKENS,
    Math.max(MIN_OUTPUT_TOKENS, Math.ceil(expectedOutputChars / CHARS_PER_TOKEN)),
  )

  const stream = client.messages.stream({
    model,
    max_tokens: dynamicMaxOutput,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  })

  // Promise.race timeout — output besar bisa lambat.
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

  // Detect output truncation — kalau model stop karena max_tokens, marker
  // HTML_END belum sempat tercetak. Surface error spesifik daripada generic
  // "format tidak valid".
  if (final.stop_reason === 'max_tokens') {
    throw new Error(
      `Output AI terpotong (max_tokens=${dynamicMaxOutput.toLocaleString('id-ID')}). LP terlalu besar untuk single-pass rewrite. Coba pecah LP jadi lebih ringkas atau hubungi admin.`,
    )
  }

  const parsed = parseTwoSectionOutput(raw)
  if (!parsed) {
    throw new Error(
      'AI tidak mengembalikan format yang valid (marker meta/html tidak lengkap). Coba lagi atau hubungi admin.',
    )
  }

  // Restore base64 images yg di-strip sebelum kirim ke AI.
  parsed.rewrittenHtml = restoreBase64Images(parsed.rewrittenHtml, base64Map)

  return {
    suggestions: parsed.suggestions,
    focusAreas: parsed.focusAreas,
    scoreBefore: parsed.scoreBefore,
    scoreAfter: parsed.scoreAfter,
    rewrittenHtml: parsed.rewrittenHtml,
    inputTokens,
    outputTokens,
  }
}

// Resolve model name dari AiFeatureConfig (admin-tunable). Dipakai di route
// untuk pass model ke client.messages.stream — fallback ke OPTIMIZE_MODEL
// kalau config belum di-seed.
export async function getOptimizeModel(): Promise<string> {
  try {
    const cfg = await getAiFeatureConfig(LP_OPTIMIZE_FEATURE_KEY)
    return cfg.modelName || OPTIMIZE_MODEL
  } catch {
    return OPTIMIZE_MODEL
  }
}

interface ParsedOpt {
  suggestions: Array<{ title: string; rationale: string; impact: string }>
  focusAreas: string[]
  scoreBefore: number | null
  scoreAfter: number | null
  rewrittenHtml: string
}

// Parser baru — extract dari format dua section. Robust:
// - Tolerate whitespace/newline di sekitar marker
// - Kalau HTML_END hilang (output kepotong tapi stop_reason bukan max_tokens
//   karena bug provider), tetap coba ambil sampai akhir output asal HTML
//   sudah punya </html> closing tag
// - Fallback ke parseLegacyJsonOutput kalau AI bandel kembali ke format JSON
function parseTwoSectionOutput(raw: string): ParsedOpt | null {
  const metaMatch = raw.match(
    new RegExp(
      `${escapeRegex(META_BEGIN)}\\s*([\\s\\S]*?)\\s*${escapeRegex(META_END)}`,
    ),
  )
  if (!metaMatch || !metaMatch[1]) {
    return parseLegacyJsonOutput(raw)
  }

  let metaJson: Record<string, unknown>
  try {
    metaJson = JSON.parse(metaMatch[1].trim()) as Record<string, unknown>
  } catch {
    // Coba ekstrak first { ... } di dalam meta section.
    const inner = metaMatch[1].match(/\{[\s\S]*\}/)
    if (!inner) return null
    try {
      metaJson = JSON.parse(inner[0]) as Record<string, unknown>
    } catch {
      return null
    }
  }

  // HTML — coba marker pair dulu, fallback: dari HTML_BEGIN sampai akhir
  // string (kalau HTML_END hilang tapi </html> ada di body).
  let html = ''
  const htmlPairMatch = raw.match(
    new RegExp(
      `${escapeRegex(HTML_BEGIN)}\\s*([\\s\\S]*?)\\s*${escapeRegex(HTML_END)}`,
    ),
  )
  if (htmlPairMatch && htmlPairMatch[1]) {
    html = htmlPairMatch[1].trim()
  } else {
    // Fallback: cari HTML_BEGIN ... </html>
    const beginIdx = raw.indexOf(HTML_BEGIN)
    if (beginIdx >= 0) {
      const tail = raw.slice(beginIdx + HTML_BEGIN.length)
      const closingIdx = tail.toLowerCase().lastIndexOf('</html>')
      if (closingIdx >= 0) {
        html = tail.slice(0, closingIdx + '</html>'.length).trim()
      }
    }
  }

  if (!html || !html.toLowerCase().includes('<html')) return null
  // Strip markdown fence yang kadang dipakai AI bandel.
  const fence = html.match(/^```(?:html|HTML)?\s*\n([\s\S]*?)\n```\s*$/)
  if (fence && fence[1]) html = fence[1].trim()

  return buildParsedOpt(metaJson, html)
}

// Fallback parser — kalau AI tetap balikin format JSON lama (rewrittenHtml
// di dalam string). Toleran supaya migrasi format tidak ngebreak existing
// in-flight requests.
function parseLegacyJsonOutput(raw: string): ParsedOpt | null {
  let text = raw
  const fence = text.match(/^```(?:json|JSON)?\s*\n([\s\S]*?)\n```\s*$/)
  if (fence && fence[1]) text = fence[1].trim()

  let json: Record<string, unknown>
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return null
    try {
      json = JSON.parse(m[0]) as Record<string, unknown>
    } catch {
      return null
    }
  }
  const html = typeof json.rewrittenHtml === 'string' ? json.rewrittenHtml.trim() : ''
  if (!html || !html.toLowerCase().includes('<html')) return null
  return buildParsedOpt(json, html)
}

function buildParsedOpt(meta: Record<string, unknown>, html: string): ParsedOpt {
  const suggestions = Array.isArray(meta.suggestions) ? meta.suggestions : []
  const focusAreas = Array.isArray(meta.focusAreas) ? meta.focusAreas : []
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
    scoreBefore: clampScoreOrNull(meta.scoreBefore),
    scoreAfter: clampScoreOrNull(meta.scoreAfter),
    rewrittenHtml: html,
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
