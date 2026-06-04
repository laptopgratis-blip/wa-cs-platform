// Post-Publish Content — generate 15 WA Status dari LP yang baru publish.
//
// Flow:
//   1. Phase A: 3 status sample (HOOK + PAIN + TRENDS) — Hulao tanggung biaya
//      AI, log dengan tokensCharged=0. User melihat preview FULL.
//   2. Phase B: 12 sisa di-generate setelah user top-up token. Charge user
//      via executeAiWithCharge.
//
// Implementasi reuse ContentBrief + ContentPiece existing supaya konten masuk
// ke Library content user (tidak hilang). Marker brief: tone='POST_PUBLISH_15'.
import type Anthropic from '@anthropic-ai/sdk'

import { DEFAULT_MODEL, getAnthropicClient } from '@/lib/anthropic'
import { prisma } from '@/lib/prisma'

import {
  computeChargeFromUsage,
  executeAiWithCharge,
  InsufficientBalanceError,
  logGeneration,
} from './ai-generation-log'

const FEATURE_KEY = 'CONTENT_GENERATE'
const BRIEF_TONE_MARKER = 'POST_PUBLISH_15'
const TOTAL_PIECES = 15
const SAMPLE_PIECES = 3
const AI_TIMEOUT_MS = 45_000

// Rotation method per index (15 total = 5 HOOK + 5 PAIN + 5 TRENDS-style).
type MethodHint = 'HOOK' | 'PAIN' | 'TRENDS' | 'PERSONA' | 'CONTRARIAN'
const METHOD_ROTATION: MethodHint[] = [
  // 3 pertama (free sample) — variasi tinggi
  'HOOK',
  'PAIN',
  'TRENDS',
  // 12 sisa — campuran 5 metode untuk kaya angle
  'HOOK',
  'PAIN',
  'PERSONA',
  'CONTRARIAN',
  'TRENDS',
  'HOOK',
  'PAIN',
  'PERSONA',
  'CONTRARIAN',
  'TRENDS',
  'HOOK',
  'PAIN',
]

const FUNNEL_ROTATION: ('TOFU' | 'MOFU' | 'BOFU')[] = [
  'TOFU',
  'MOFU',
  'BOFU',
  'TOFU',
  'MOFU',
  'BOFU',
  'TOFU',
  'MOFU',
  'BOFU',
  'TOFU',
  'MOFU',
  'BOFU',
  'TOFU',
  'MOFU',
  'BOFU',
]

const METHOD_HINTS: Record<MethodHint, string> = {
  HOOK: 'Buat hook curiosity 3 detik — buat orang berhenti scroll. Bisa pakai pertanyaan, kontradiksi, atau angka mengejutkan.',
  PAIN: 'Sebutkan pain spesifik audience yang LP ini solve. Bikin mereka relate: "ini gw banget".',
  TRENDS:
    'Sambungkan dengan tren/peristiwa terkini yang relate. Boleh metafora atau analogi dari hal yang lagi viral.',
  PERSONA:
    'Tulis dari sudut pandang persona spesifik (mis. ibu rumah tangga, karyawan kantoran, pelajar). Ceritakan situasi mereka.',
  CONTRARIAN:
    'Ambil sudut pandang berlawanan dari yang umum dipikirkan. Bikin orang penasaran "kok bisa?".',
}

const COMMON_SYSTEM = `Kamu adalah copywriter sosmed Indonesia untuk seller UMKM. Output Bahasa Indonesia casual, no English jargon.

ATURAN KETAT:
- Hook 3 detik pertama HARUS punchy
- Body 2-3 baris, jelas, tidak bertele-tele
- CTA natural arahkan ke link/produk (jangan hard-sell)
- Output HANYA JSON valid, no markdown fence, no preamble
- Total maksimum 700 karakter (Status WA limit)`

const WA_STATUS_SCHEMA = `Schema output:
{
  "title": "string — internal title untuk library (max 100 char)",
  "hook": "string — 1 baris pembuka punchy (max 80 char)",
  "body": "string — isi utama 2-3 baris",
  "cta": "string — call-to-action 1 baris arahkan ke link",
  "imageHint": "string — deskripsi visual singkat (untuk Phase 2)"
}`

interface LpContext {
  title: string
  metaTitle: string | null
  metaDesc: string | null
  textSnippet: string
}

interface GenerateOnePieceResult {
  bodyJson: {
    title: string
    hook: string
    body: string
    cta: string
    imageHint: string
  }
  title: string
  inputTokens: number
  outputTokens: number
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchLpContext(lpId: string, userId: string): Promise<LpContext | null> {
  const lp = await prisma.landingPage.findFirst({
    where: { id: lpId, userId },
    select: {
      title: true,
      metaTitle: true,
      metaDesc: true,
      htmlContent: true,
    },
  })
  if (!lp) return null
  return {
    title: lp.title,
    metaTitle: lp.metaTitle,
    metaDesc: lp.metaDesc,
    textSnippet: stripHtml(lp.htmlContent).slice(0, 1800),
  }
}

function buildPrompt(
  ctx: LpContext,
  method: MethodHint,
  funnel: 'TOFU' | 'MOFU' | 'BOFU',
  pieceIdx: number,
): string {
  const FUNNEL_HINT: Record<typeof funnel, string> = {
    TOFU: 'Awareness — perkenalkan masalah/topik, jangan langsung jual.',
    MOFU: 'Consideration — kasih insight/proof yang relate.',
    BOFU: 'Decision — push ke CTA, alasan beli sekarang.',
  }

  return `KONTEKS LP:
- Judul: ${ctx.title}
${ctx.metaDesc ? `- Deskripsi: ${ctx.metaDesc}\n` : ''}- Cuplikan isi: ${ctx.textSnippet}

VARIASI INI:
- Status WA #${pieceIdx + 1} dari 15 (tiap status harus UNIK, jangan ulang hook/angle yang sama)
- Method: ${method} — ${METHOD_HINTS[method]}
- Funnel stage: ${funnel} — ${FUNNEL_HINT[funnel]}

${WA_STATUS_SCHEMA}

TUGAS: hasilkan 1 WhatsApp Status (text only) untuk audience seller UMKM Indonesia, mengarahkan ke LP di atas. Pastikan UNIK dari status lain di batch ini. Output HARUS JSON valid.`
}

async function callAiForOnePiece(prompt: string): Promise<GenerateOnePieceResult> {
  const client = getAnthropicClient()
  const response = (await Promise.race([
    client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 1_200,
      system: COMMON_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('AI timeout')), AI_TIMEOUT_MS),
    ),
  ])) as Anthropic.Messages.Message

  const text = response.content
    .filter((b: Anthropic.ContentBlock): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(text) as Record<string, unknown>
  } catch (err) {
    throw new Error(
      `Parse JSON gagal: ${err instanceof Error ? err.message : String(err)}. Raw: ${text.slice(0, 200)}`,
    )
  }

  const body = {
    title: String(parsed.title ?? '').slice(0, 200) || 'WA Status',
    hook: String(parsed.hook ?? '').slice(0, 200),
    body: String(parsed.body ?? '').slice(0, 600),
    cta: String(parsed.cta ?? '').slice(0, 200),
    imageHint: String(parsed.imageHint ?? '').slice(0, 300),
  }

  return {
    bodyJson: body,
    title: body.title,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  }
}

// ─── Public API ──────────────────────────────────────────────────────────

export interface PostPublishState {
  briefId: string | null
  pieces: Array<{
    id: string
    title: string
    bodyJson: unknown
    funnelStage: string
    isPaid: boolean // false = free sample, true = unlocked (charged)
    createdAt: Date
  }>
  totalGenerated: number
  totalExpected: number
  // True kalau semua 15 sudah generated.
  isComplete: boolean
}

export async function getPostPublishState(input: {
  userId: string
  lpId: string
}): Promise<PostPublishState> {
  const brief = await prisma.contentBrief.findFirst({
    where: {
      userId: input.userId,
      lpId: input.lpId,
      tone: BRIEF_TONE_MARKER,
    },
    select: {
      id: true,
      pieces: {
        select: {
          id: true,
          title: true,
          bodyJson: true,
          funnelStage: true,
          tokensCharged: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!brief) {
    return {
      briefId: null,
      pieces: [],
      totalGenerated: 0,
      totalExpected: TOTAL_PIECES,
      isComplete: false,
    }
  }
  return {
    briefId: brief.id,
    pieces: brief.pieces.map((p) => ({
      id: p.id,
      title: p.title,
      bodyJson: p.bodyJson,
      funnelStage: p.funnelStage,
      isPaid: p.tokensCharged > 0,
      createdAt: p.createdAt,
    })),
    totalGenerated: brief.pieces.length,
    totalExpected: TOTAL_PIECES,
    isComplete: brief.pieces.length >= TOTAL_PIECES,
  }
}

// Generate 3 sample free (Hulao tanggung). Idempotent — kalau sudah ada,
// return state existing.
export async function generatePostPublishSamples(input: {
  userId: string
  lpId: string
}): Promise<{ state: PostPublishState; error?: string }> {
  const lp = await fetchLpContext(input.lpId, input.userId)
  if (!lp) return { state: await getPostPublishState(input), error: 'LP_NOT_FOUND' }

  let brief = await prisma.contentBrief.findFirst({
    where: {
      userId: input.userId,
      lpId: input.lpId,
      tone: BRIEF_TONE_MARKER,
    },
    select: { id: true, _count: { select: { pieces: true } } },
  })

  // Sudah ada brief + pieces — idempotent return.
  if (brief && brief._count.pieces >= SAMPLE_PIECES) {
    return { state: await getPostPublishState(input) }
  }

  // Buat brief kalau belum.
  if (!brief) {
    const created = await prisma.contentBrief.create({
      data: {
        userId: input.userId,
        lpId: input.lpId,
        tone: BRIEF_TONE_MARKER,
        funnelMix: { tofu: 5, mofu: 5, bofu: 5 },
        status: 'GENERATING',
      },
      select: { id: true, _count: { select: { pieces: true } } },
    })
    brief = created
  }

  // Generate 3 sample (sequential — supaya tidak hit rate limit).
  const startIdx = brief._count.pieces
  for (let i = startIdx; i < SAMPLE_PIECES; i++) {
    const method = METHOD_ROTATION[i]
    const funnel = FUNNEL_ROTATION[i]
    const prompt = buildPrompt(lp, method, funnel, i)
    try {
      const ai = await callAiForOnePiece(prompt)
      await prisma.contentPiece.create({
        data: {
          userId: input.userId,
          briefId: brief.id,
          channel: 'WA_STATUS',
          funnelStage: funnel,
          format: 'TEXT',
          title: ai.title,
          bodyJson: ai.bodyJson,
          status: 'DRAFT',
          tokensCharged: 0, // free sample — Hulao tanggung
        },
      })
      // Log untuk audit cost AI yang Hulao tanggung.
      const charge = await computeChargeFromUsage({
        featureKey: FEATURE_KEY,
        inputTokens: ai.inputTokens,
        outputTokens: ai.outputTokens,
      })
      await logGeneration({
        featureKey: 'POST_PUBLISH_SAMPLE',
        userId: input.userId,
        subjectType: 'CONTENT_BRIEF',
        subjectId: brief.id,
        charge: { ...charge, tokensCharged: 0, revenueRp: 0, profitRp: -charge.apiCostRp, marginPct: -100 },
        status: 'OK',
      })
    } catch (err) {
      console.error('[post-publish sample] gagal index', i, err)
      // Lanjut ke piece berikutnya — jangan abort semua kalau 1 gagal.
    }
  }

  return { state: await getPostPublishState(input) }
}

// Generate 12 sisa (charge user). Idempotent — skip piece yang sudah ada.
export async function generatePostPublishUnlock(input: {
  userId: string
  lpId: string
}): Promise<{
  state: PostPublishState
  generatedCount: number
  totalTokensCharged: number
  error?: 'LP_NOT_FOUND' | 'BRIEF_NOT_FOUND' | 'INSUFFICIENT_BALANCE'
  tokensRequired?: number
}> {
  const lp = await fetchLpContext(input.lpId, input.userId)
  if (!lp) {
    return {
      state: await getPostPublishState(input),
      generatedCount: 0,
      totalTokensCharged: 0,
      error: 'LP_NOT_FOUND',
    }
  }

  const brief = await prisma.contentBrief.findFirst({
    where: {
      userId: input.userId,
      lpId: input.lpId,
      tone: BRIEF_TONE_MARKER,
    },
    select: { id: true, _count: { select: { pieces: true } } },
  })
  if (!brief) {
    return {
      state: await getPostPublishState(input),
      generatedCount: 0,
      totalTokensCharged: 0,
      error: 'BRIEF_NOT_FOUND',
    }
  }

  const startIdx = brief._count.pieces
  if (startIdx >= TOTAL_PIECES) {
    return {
      state: await getPostPublishState(input),
      generatedCount: 0,
      totalTokensCharged: 0,
    }
  }

  let generatedCount = 0
  let totalTokensCharged = 0
  let insufficient = false
  let tokensRequiredForOne = 0

  for (let i = startIdx; i < TOTAL_PIECES; i++) {
    const method = METHOD_ROTATION[i]
    const funnel = FUNNEL_ROTATION[i]
    const prompt = buildPrompt(lp, method, funnel, i)
    try {
      const { result, charge } = await executeAiWithCharge<GenerateOnePieceResult>({
        featureKey: FEATURE_KEY,
        userId: input.userId,
        ctx: {
          referencePrefix: `post_publish:${brief.id}`,
          description: `Post-Publish WA Status #${i + 1}`,
          subjectType: 'CONTENT_PIECE',
          subjectId: brief.id,
          estimateInputTokens: 1_500,
          estimateOutputTokens: 600,
          aiCall: async () => {
            const ai = await callAiForOnePiece(prompt)
            return {
              result: ai,
              inputTokens: ai.inputTokens,
              outputTokens: ai.outputTokens,
            }
          },
        },
      })
      await prisma.contentPiece.create({
        data: {
          userId: input.userId,
          briefId: brief.id,
          channel: 'WA_STATUS',
          funnelStage: funnel,
          format: 'TEXT',
          title: result.title,
          bodyJson: result.bodyJson,
          status: 'DRAFT',
          tokensCharged: charge.tokensCharged,
        },
      })
      generatedCount++
      totalTokensCharged += charge.tokensCharged
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        insufficient = true
        tokensRequiredForOne = err.tokensRequired
        break
      }
      console.error('[post-publish unlock] gagal index', i, err)
      // Lanjut ke berikutnya — partial generation OK.
    }
  }

  // Tandai brief COMPLETED kalau total tercapai.
  const finalCount = startIdx + generatedCount
  if (finalCount >= TOTAL_PIECES) {
    await prisma.contentBrief.update({
      where: { id: brief.id },
      data: { status: 'COMPLETED' },
    })
  }

  if (insufficient && generatedCount === 0) {
    return {
      state: await getPostPublishState(input),
      generatedCount: 0,
      totalTokensCharged: 0,
      error: 'INSUFFICIENT_BALANCE',
      tokensRequired: tokensRequiredForOne,
    }
  }

  return {
    state: await getPostPublishState(input),
    generatedCount,
    totalTokensCharged,
  }
}
