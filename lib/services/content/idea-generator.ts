// Idea Generator — orchestrator 3 metode AI parallel:
//   1. HOOK   — sample 5 hook framework, AI fill dgn LP context
//   2. PAIN   — AI inference 5 pain-point audience LP
//   3. PERSONA — AI simulate 5 persona POV → 5 narasi
//
// Output: 15 ContentIdea total. 3 ide pertama (HOOK_1, PAIN_1, PERSONA_1)
// di-tag isFreePreview=true → tampil gratis tanpa deduct. 12 sisanya gated.
//
// Token billing: pre-flight balance check, run 3 AI call parallel,
// aggregate usage, atomic deduct platform tokens, log ke AiGenerationLog.
//
// Failure mode: kalau salah satu metode AI fail, fallback ke 2 metode
// remaining + log warning. Tidak block whole flow.
import type Anthropic from '@anthropic-ai/sdk'

import { getAnthropicClient } from '@/lib/anthropic'
import { prisma } from '@/lib/prisma'

import {
  type ComputedCharge,
  computeChargeFromUsage,
  deductTokenAtomic,
  hasEnoughBalance,
  logGeneration,
} from '../ai-generation-log'

import { HOOK_FRAMEWORKS, sampleHookFrameworks } from './hook-frameworks'

const FEATURE_KEY = 'CONTENT_IDEA'
const AI_TIMEOUT_MS = 60_000
const MAX_OUTPUT_TOKENS = 2_500 // per metode

export type IdeaMethod = 'HOOK' | 'PAIN' | 'PERSONA'
export type FunnelStage = 'TOFU' | 'MOFU' | 'BOFU'

export interface IdeaInput {
  // Source LP — kalau ada, di-fetch dari DB untuk extract context.
  lpId?: string
  // Brief manual fields — dipakai kalau lpId null.
  manualTitle?: string
  manualAudience?: string
  manualOffer?: string
}

export interface GeneratedIdea {
  method: IdeaMethod
  hook: string
  angle: string
  channelFit: string[]
  format: string
  whyItWorks: string
  predictedVirality: number
  funnelStage: FunnelStage
  estimatedTokens: number
}

export interface IdeaGenerationResult {
  ideas: GeneratedIdea[]
  charge: ComputedCharge
  // Diagnostic per metode — null = fail.
  methodResults: { method: IdeaMethod; ok: boolean; error?: string }[]
}

// ─────────────────────── Context extraction ───────────────────────

interface LpContext {
  title: string
  metaTitle: string | null
  metaDesc: string | null
  textContent: string // stripped HTML, max 3000 char
}

async function buildContext(input: IdeaInput): Promise<{
  contextSummary: string
  hasRichSource: boolean
}> {
  if (input.lpId) {
    const lp = await prisma.landingPage.findUnique({
      where: { id: input.lpId },
      select: {
        title: true,
        metaTitle: true,
        metaDesc: true,
        htmlContent: true,
      },
    })
    if (lp) {
      const ctx: LpContext = {
        title: lp.title,
        metaTitle: lp.metaTitle,
        metaDesc: lp.metaDesc,
        textContent: stripHtml(lp.htmlContent).slice(0, 3000),
      }
      return {
        contextSummary: [
          `Judul LP: ${ctx.title}`,
          ctx.metaTitle ? `Meta title: ${ctx.metaTitle}` : null,
          ctx.metaDesc ? `Meta desc: ${ctx.metaDesc}` : null,
          `Isi LP (cuplikan):\n${ctx.textContent}`,
        ]
          .filter(Boolean)
          .join('\n\n'),
        hasRichSource: ctx.textContent.length > 200,
      }
    }
  }
  // Brief manual fallback.
  const summary = [
    input.manualTitle ? `Judul produk/topic: ${input.manualTitle}` : null,
    input.manualAudience ? `Target audience: ${input.manualAudience}` : null,
    input.manualOffer ? `Penawaran/offer: ${input.manualOffer}` : null,
  ]
    .filter(Boolean)
    .join('\n')
  return {
    contextSummary: summary || 'Brief manual kosong — generate ide generic untuk produk online seller.',
    hasRichSource: Boolean(input.manualTitle && input.manualOffer),
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─────────────────────── Prompt builders ───────────────────────

const COMMON_SYSTEM = `Kamu adalah AI content strategist yg bantu seller Indonesia bikin konten organik di sosmed (IG, TikTok, WA Status). Output bahasa Indonesia, casual conversational. JANGAN gunakan emoji berlebihan (max 1-2 per ide). JANGAN repetitive. Tiap ide harus actionable dan bisa direkam/diposting hari itu juga.

Output FORMAT WAJIB JSON array dari 5 object dengan struktur:
[
  {
    "hook": "tagline pembuka 1 baris pendek (max 80 karakter)",
    "angle": "sudut pendekatan, 1-2 kalimat penjelasan kenapa angle ini",
    "channelFit": ["IG_REELS", "TIKTOK"],
    "format": "VIDEO_SCRIPT|CAROUSEL|SINGLE_IMAGE|TEXT_POST",
    "whyItWorks": "1 kalimat alasan psikologis kenapa hook ini bekerja",
    "predictedVirality": 4,
    "funnelStage": "TOFU|MOFU|BOFU",
    "estimatedTokens": 800
  }
]

channelFit values yg valid: WA_STATUS, IG_STORY, IG_POST, IG_CAROUSEL, IG_REELS, TIKTOK.
predictedVirality: integer 1-5.
estimatedTokens: integer 500-1500 prediksi token AI cost kalau ide ini di-generate full.

Output HANYA JSON valid, tanpa markdown code fence, tanpa preamble.`

function buildHookPrompt(context: string, frameworks: typeof HOOK_FRAMEWORKS): string {
  const fwList = frameworks
    .map(
      (f, i) =>
        `${i + 1}. ${f.name}\n   Struktur: ${f.structure}\n   Contoh: ${f.example}\n   Best for: ${f.bestFor.join(', ')}\n   Funnel: ${f.funnelFit.join('/')}`,
    )
    .join('\n\n')
  return `KONTEKS PRODUK/LP:
${context}

5 HOOK FRAMEWORK YG WAJIB DIPAKAI (1 framework = 1 ide, urut sesuai list):
${fwList}

Hasilkan 5 ide konten dengan menerapkan masing-masing framework di atas ke konteks produk. Tiap ide harus:
- Konkret (bukan generic), spesifik ke produk/audience ini
- Hook 1 baris yg langsung bikin orang berhenti scroll
- Channel fit yg sesuai rekomendasi framework (channelFit array)
- Funnel stage sesuai framework (TOFU/MOFU/BOFU)

Keluarkan JSON array 5 object sesuai schema.`
}

function buildPainPrompt(context: string): string {
  return `KONTEKS PRODUK/LP:
${context}

Tugas: identifikasi 5 PAIN-POINT terbesar audience produk ini. Untuk tiap pain, hasilkan 1 ide konten yg "memukul" pain itu langsung — relate-able, bukan menjual.

Mix funnel: 2 ide TOFU (pain education, awareness), 2 MOFU (problem-solution fit), 1 BOFU (offer langsung yg jawab pain).
Channel fit variatif: minimal 1 untuk WA_STATUS, 1 untuk IG_REELS/TIKTOK, 1 untuk IG_CAROUSEL.

Tiap hook harus mulai dengan pain yg spesifik (bukan generic "kamu pengen sukses?"). Contoh pain spesifik: "kamu udah posting tiap hari tapi follower stuck 200an?" atau "udah pasang LP tapi gak ada yg DM masuk?".

Keluarkan JSON array 5 object sesuai schema.`
}

function buildPersonaPrompt(context: string): string {
  return `KONTEKS PRODUK/LP:
${context}

Tugas: simulate 5 PERSONA target audience produk ini (variasi umur, gender, profesi, life situation). Untuk tiap persona, hasilkan 1 ide konten dari sudut pandang first-person ATAU testimonial-feel ("aku dulu...", "dulu gw stuck di...", "sebagai [persona]...").

Output ide harus terdengar otentik, kayak orang real cerita pengalaman. Bukan iklan.

Mix funnel: 1 TOFU, 2 MOFU, 2 BOFU.
Channel fit: minimal 2 yg fit untuk IG_REELS/TIKTOK (storytime), 1 IG_CAROUSEL (transformation), 1 WA_STATUS atau IG_STORY (snippet).

Keluarkan JSON array 5 object sesuai schema. Hook tiap ide harus terdengar seperti narasi pribadi, bukan deskripsi.`
}

// ─────────────────────── AI call wrapper ───────────────────────

interface MethodCallResult {
  method: IdeaMethod
  ideas: GeneratedIdea[]
  inputTokens: number
  outputTokens: number
  error?: string
}

async function callAi(
  method: IdeaMethod,
  prompt: string,
): Promise<MethodCallResult> {
  const client = getAnthropicClient()
  try {
    const response = (await Promise.race([
      client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: MAX_OUTPUT_TOKENS,
        system: COMMON_SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      }),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`AI timeout ${AI_TIMEOUT_MS / 1000}s`)),
          AI_TIMEOUT_MS,
        ),
      ),
    ])) as Anthropic.Messages.Message

    const text = response.content
      .filter((b: Anthropic.ContentBlock): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    const parsed = parseIdeasJson(text, method)
    return {
      method,
      ideas: parsed,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    }
  } catch (err) {
    return {
      method,
      ideas: [],
      inputTokens: 0,
      outputTokens: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function parseIdeasJson(raw: string, method: IdeaMethod): GeneratedIdea[] {
  // Strip markdown code fence kalau ada (defensif walau prompt minta tidak).
  let cleaned = raw.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const parsed = JSON.parse(cleaned) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error(`AI return non-array (method=${method})`)
  }
  return parsed.map((it, idx) => sanitizeIdea(it, method, idx))
}

const VALID_CHANNELS = new Set([
  'WA_STATUS',
  'IG_STORY',
  'IG_POST',
  'IG_CAROUSEL',
  'IG_REELS',
  'TIKTOK',
])
const VALID_FORMATS = new Set([
  'VIDEO_SCRIPT',
  'CAROUSEL',
  'SINGLE_IMAGE',
  'TEXT_POST',
])
const VALID_FUNNELS = new Set(['TOFU', 'MOFU', 'BOFU'])

function sanitizeIdea(raw: unknown, method: IdeaMethod, idx: number): GeneratedIdea {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Item ${idx} method=${method} bukan object`)
  }
  const o = raw as Record<string, unknown>
  const channelFit = Array.isArray(o.channelFit)
    ? (o.channelFit as unknown[])
        .map((c) => String(c).toUpperCase())
        .filter((c) => VALID_CHANNELS.has(c))
    : []
  if (channelFit.length === 0) channelFit.push('IG_POST') // fallback
  const format =
    typeof o.format === 'string' && VALID_FORMATS.has(o.format.toUpperCase())
      ? o.format.toUpperCase()
      : 'TEXT_POST'
  const funnelStage =
    typeof o.funnelStage === 'string' &&
    VALID_FUNNELS.has(o.funnelStage.toUpperCase())
      ? (o.funnelStage.toUpperCase() as FunnelStage)
      : 'TOFU'
  const predictedVirality = clampInt(o.predictedVirality, 3, 1, 5)
  const estimatedTokens = clampInt(o.estimatedTokens, 800, 300, 3000)
  return {
    method,
    hook: String(o.hook ?? '').slice(0, 200).trim() || 'Hook generic',
    angle: String(o.angle ?? '').slice(0, 500).trim() || 'Angle generic',
    channelFit,
    format,
    whyItWorks: String(o.whyItWorks ?? '').slice(0, 300).trim() || '',
    predictedVirality,
    funnelStage,
    estimatedTokens,
  }
}

function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10)
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, Math.floor(n)))
}

// ─────────────────────── Main orchestrator ───────────────────────

export async function generateIdeas(input: {
  userId: string
  lpId?: string
  manualTitle?: string
  manualAudience?: string
  manualOffer?: string
  // mode='preview' → run AI tapi mark 3 ide pertama sebagai isFreePreview=true,
  // log dengan status='OK', tetap deduct token (because AI did get called).
  // Caller bisa decide untuk skip-deduct kalau preview-only flow.
  // 'full' = normal flow.
  mode?: 'preview' | 'full'
}): Promise<{
  ideas: (GeneratedIdea & { isFreePreview: boolean })[]
  charge: ComputedCharge | null
  methodResults: { method: IdeaMethod; ok: boolean; error?: string }[]
  status: 'OK' | 'INSUFFICIENT_BALANCE'
}> {
  const { contextSummary } = await buildContext(input)

  // Pre-flight estimasi balance kalau mode=full. Kita estimate ~15K input
  // + 3K output (3 metode × ~1K output = 3K). Charge biasanya 200-500 token.
  const estimateInput = 15_000
  const estimateOutput = 3_000
  const preCheck = await computeChargeFromUsage({
    featureKey: FEATURE_KEY,
    inputTokens: estimateInput,
    outputTokens: estimateOutput,
  })

  if (input.mode !== 'preview') {
    const ok = await hasEnoughBalance(input.userId, preCheck.tokensCharged)
    if (!ok) {
      // Log INSUFFICIENT_BALANCE untuk audit, no AI call.
      await logGeneration({
        featureKey: FEATURE_KEY,
        userId: input.userId,
        subjectType: input.lpId ? 'LP' : 'BRIEF_MANUAL',
        subjectId: input.lpId,
        charge: { ...preCheck, inputTokens: 0, outputTokens: 0, apiCostUsd: 0, apiCostRp: 0, profitRp: 0, marginPct: 0, revenueRp: 0 },
        status: 'INSUFFICIENT_BALANCE',
        errorMessage: `Saldo kurang. Butuh ±${preCheck.tokensCharged} token`,
      })
      return {
        ideas: [],
        charge: preCheck,
        methodResults: [],
        status: 'INSUFFICIENT_BALANCE',
      }
    }
  }

  // Run 3 metode parallel.
  const sampledFrameworks = sampleHookFrameworks(5)
  const [hookRes, painRes, personaRes] = await Promise.all([
    callAi('HOOK', buildHookPrompt(contextSummary, sampledFrameworks)),
    callAi('PAIN', buildPainPrompt(contextSummary)),
    callAi('PERSONA', buildPersonaPrompt(contextSummary)),
  ])

  const allIdeas: (GeneratedIdea & { isFreePreview: boolean })[] = []
  const methodResults = [hookRes, painRes, personaRes].map((r) => ({
    method: r.method,
    ok: !r.error && r.ideas.length > 0,
    error: r.error,
  }))

  // Free preview: 1 ide pertama dari tiap metode.
  ;[hookRes, painRes, personaRes].forEach((r) => {
    r.ideas.forEach((idea, idx) => {
      allIdeas.push({ ...idea, isFreePreview: idx === 0 })
    })
  })

  const totalInput = hookRes.inputTokens + painRes.inputTokens + personaRes.inputTokens
  const totalOutput = hookRes.outputTokens + painRes.outputTokens + personaRes.outputTokens

  // Compute actual charge.
  const charge = await computeChargeFromUsage({
    featureKey: FEATURE_KEY,
    inputTokens: totalInput,
    outputTokens: totalOutput,
  })

  if (input.mode === 'preview') {
    // Preview-only: log charge=0 (gratis), tapi tetap save aktivitas.
    // Sebenarnya kita TIDAK panggil AI di mode preview kalau strict — di sini
    // kita tetap pakai 3 ide pertama dari hasil call (caller yg decide skip
    // expensive call). Untuk MVP simplicity, mode=preview di-charge tapi
    // hanya 3 ide visible. Future: split jadi 2 pass (preview cheap, full).
    return {
      ideas: allIdeas,
      charge,
      methodResults,
      status: 'OK',
    }
  }

  // Atomic deduct.
  const dedRes = await deductTokenAtomic({
    userId: input.userId,
    tokensCharged: charge.tokensCharged,
    description: `Idea Generator (${allIdeas.length} ide)`,
    reference: input.lpId ?? `manual:${Date.now()}`,
  })

  await logGeneration({
    featureKey: FEATURE_KEY,
    userId: input.userId,
    subjectType: input.lpId ? 'LP' : 'BRIEF_MANUAL',
    subjectId: input.lpId,
    charge,
    status: dedRes.ok ? 'OK' : 'INSUFFICIENT_BALANCE',
    errorMessage: dedRes.ok ? undefined : 'Race: saldo turun mid-flow',
  })

  if (!dedRes.ok) {
    return {
      ideas: [],
      charge,
      methodResults,
      status: 'INSUFFICIENT_BALANCE',
    }
  }

  return { ideas: allIdeas, charge, methodResults, status: 'OK' }
}

// Persist ideas ke DB. Caller pakai output generateIdeas → save batch
// untuk display di Library + later promote.
export async function persistIdeas(input: {
  userId: string
  lpId?: string
  ideas: (GeneratedIdea & { isFreePreview: boolean })[]
}): Promise<{ id: string }[]> {
  if (input.ideas.length === 0) return []
  const created = await prisma.$transaction(
    input.ideas.map((idea) =>
      prisma.contentIdea.create({
        data: {
          userId: input.userId,
          lpId: input.lpId ?? null,
          method: idea.method,
          hook: idea.hook,
          angle: idea.angle,
          channelFit: idea.channelFit,
          format: idea.format,
          whyItWorks: idea.whyItWorks,
          predictedVirality: idea.predictedVirality,
          funnelStage: idea.funnelStage,
          estimatedTokens: idea.estimatedTokens,
          isFreePreview: idea.isFreePreview,
        },
        select: { id: true },
      }),
    ),
  )
  return created
}
