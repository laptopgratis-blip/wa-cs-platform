// Content generation per channel — convert ContentIdea → ContentPiece full
// body. AI prompt aware channel format (WA Status, IG Story/Post/Carousel/
// Reels script, TikTok script).
//
// Flow:
//   1. Load idea (atau idea-snippet kalau dari Brief manual)
//   2. Pre-flight balance check
//   3. AI call dengan channel-specific prompt template
//   4. Parse channel-specific JSON output
//   5. Atomic deduct + log
//   6. Persist ContentPiece (+ ContentSlide kalau IG_CAROUSEL)
import type Anthropic from '@anthropic-ai/sdk'

import { getAnthropicClient } from '@/lib/anthropic'
import { prisma } from '@/lib/prisma'

import {
  computeChargeFromUsage,
  deductTokenAtomic,
  hasEnoughBalance,
  logGeneration,
} from '../ai-generation-log'

const FEATURE_KEY = 'CONTENT_GENERATE'
const AI_TIMEOUT_MS = 90_000
const MAX_OUTPUT_TOKENS = 4_000

export type Channel =
  | 'WA_STATUS'
  | 'IG_STORY'
  | 'IG_POST'
  | 'IG_CAROUSEL'
  | 'IG_REELS'
  | 'TIKTOK'

interface IdeaSnippet {
  hook: string
  angle: string
  whyItWorks: string
  funnelStage: 'TOFU' | 'MOFU' | 'BOFU'
}

interface BriefContext {
  briefId: string
  lpTitle?: string
  lpContentSnippet?: string
  manualTitle?: string
  manualAudience?: string
  manualOffer?: string
  tone: string
}

// ─────────────────────── Channel format prompts ───────────────────────

const COMMON_SYSTEM = `Kamu adalah copywriter sosmed Indonesia. Bahasa casual conversational, target audience seller online & UMKM Indonesia. Output bahasa Indonesia, no English jargon kecuali brand/produk.

Aturan KETAT:
- Hook 3 detik pertama harus berhenti scroll
- CTA jelas dan natural, bukan hard-sell
- Hashtag relevan max 5 (untuk IG)
- Output HANYA JSON valid sesuai schema yg diberikan, no markdown fence, no preamble`

const CHANNEL_SCHEMAS: Record<Channel, { description: string; example: string }> = {
  WA_STATUS: {
    description: `WhatsApp Status — 1 frame text/image. Max 700 karakter total.
Schema: { "title": "internal title untuk library", "hook": "1 baris pembuka punchy (max 80 char)", "body": "isi utama 2-3 baris", "cta": "call-to-action 1 baris", "imageHint": "deskripsi visual 1 kalimat untuk Phase 2 visual gen" }`,
    example: '{"title":"WA Status: pain LP sepi","hook":"LP-mu udah kelihatan keren tapi sepi DM?","body":"Bukan karena designnya. Bukan karena harga. Yang bikin orang gak DM = nggak ada urgency di hook pertama.","cta":"Coba ganti kalimat pertama LP-mu hari ini.","imageHint":"Mockup screen LP dengan arrow pointing ke headline"}',
  },
  IG_STORY: {
    description: `Instagram Story — 1 frame 9:16. Max 100 karakter visible.
Schema: { "title": "internal title", "hook": "1 baris super pendek (max 60 char)", "stickerText": "teks untuk poll/question sticker", "cta": "swipe-up CTA atau '@mention'", "imageHint": "deskripsi visual 9:16" }`,
    example: '{"title":"IG Story: question sticker LP","hook":"LP kamu udah convert?","stickerText":"YA, sales naik 🚀 / BELUM, masih sepi 😭","cta":"Cek ulang LP kamu sebelum buang budget iklan","imageHint":"Background gradient orange dengan text overlay center"}',
  },
  IG_POST: {
    description: `Instagram Post single image 1:1. Caption + 5 hashtag.
Schema: { "title": "internal title", "hook": "3 baris pembuka caption", "body": "isi caption 4-6 paragraf", "cta": "CTA penutup", "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5"], "imageHint": "deskripsi visual 1:1" }`,
    example: '{"title":"IG Post: 3 kesalahan LP","hook":"Stop. \\nKamu lagi rugi gara-gara LP-mu.\\n\\nSerius.","body":"Gw audit 50 LP minggu ini. Pola yang sama:\\n\\n1. Headline ga jelas value-nya\\n2. CTA ngumpet di bawah\\n3. Foto produk asli ditutup template\\n\\nSemua bikin pengunjung bingung 3 detik pertama. Habis itu mereka close tab.","cta":"Buka LP kamu sekarang. Cek 3 hal di atas. Comment hasilnya — gw bantu fix.","hashtags":["#landingpage","#bisnisonline","#sellertips","#cuanonline","#hulao"],"imageHint":"Carousel-style image dengan judul \\"3 KESALAHAN LP YANG BIKIN SEPI\\" + 3 ikon"}',
  },
  IG_CAROUSEL: {
    description: `Instagram Carousel 5-7 slide 1:1.
Schema: { "title": "internal title", "slides": [{"headline": "judul slide 1", "body": "isi 1-2 kalimat"}, ...], "caption": "caption pendamping post", "cta": "CTA di slide terakhir", "hashtags": ["#tag1",...], "imageHint": "style visual" }
Slides: 1=hook cover, 2-5=value/insight, last=CTA. Total 5-7 slides.`,
    example: '{"title":"Carousel: 5 step bikin LP convert","slides":[{"headline":"5 STEP BIKIN LP YANG BENER-BENER CLOSING","body":"Tested di 100+ produk online. Bukan teori."},{"headline":"1. HOOK 3 DETIK","body":"Headline pertama jawab: \\"WHY should I care\\". Bukan nama produk."},{"headline":"2. PROOF DI ATAS LIPATAN","body":"Testimoni atau angka konkret tampil sebelum scroll. Trust dulu, jualan kemudian."},{"headline":"3. CTA TUNGGAL","body":"Satu LP = satu CTA. Jangan kasih opsi yang bikin bingung."},{"headline":"4. URGENCY REAL","body":"Bukan \\"limited time\\" generic. Sebut alasan konkret kenapa harus sekarang."},{"headline":"5. SOCIAL PROOF NEAR CTA","body":"Tepat sebelum tombol beli, kasih 1 testimoni terkuat. Push final."},{"headline":"SIAP COBA?","body":"Save post ini. Audit LP kamu. Atau pakai Hulao bikin LP gratis dalam 2 menit."}],"caption":"Kamu bingung kenapa LP gak convert? Slide ini answer-nya. Save dulu sebelum lupa.","cta":"Try Hulao LP gratis: hulao.id/landing-pages","hashtags":["#landingpage","#cuanonline","#sellertips","#bisnisindonesia","#hulao"],"imageHint":"Cover slide bg orange #ea580c, text putih bold center; slide 2-6 bg cream warm dengan accent orange"}',
  },
  IG_REELS: {
    description: `Instagram Reels — script video 15-60 detik. Vertical 9:16.
Schema: { "title": "internal title", "hook": "narasi 3 detik pertama (max 50 char visible)", "scenes": [{"seconds": "0-3", "narration": "yang diomongin", "visual": "yang ditampilkan", "broll": "B-roll suggestion atau on-screen text"}, ...], "caption": "caption post + 5 hashtag", "cta": "CTA penutup video", "soundSuggest": "suggestion audio trending atau kata kunci" }
Scene durasi total 15-60s. Hook scene 0-3 wajib.`,
    example: '{"title":"Reels: storytime LP audit","hook":"LP gw flop 47 hari. Hari 48 viral.","scenes":[{"seconds":"0-3","narration":"LP gw flop 47 hari berturut-turut.","visual":"Speaker direct camera close-up, text overlay \\"47 HARI FLOP\\"","broll":"Cut quick ke screen analytics 0 visitor"},{"seconds":"3-10","narration":"Hari ke-48, gw ubah satu hal. Bukan harga. Bukan produk. Headline.","visual":"Speaker walking + b-roll laptop edit headline","broll":"Text overlay tiap kata kunci"},{"seconds":"10-25","narration":"Headline lama: nama produk. Headline baru: pertanyaan ke audience tentang pain mereka. Hari itu juga DM masuk 8.","visual":"Split screen before/after headline + screen DM masuk","broll":"Notif sound effect tiap DM"},{"seconds":"25-40","narration":"Lesson: LP bukan tentang kamu. Tentang mereka. Pain mereka. Keinginan mereka.","visual":"Speaker direct, slow zoom in","broll":"Text overlay quote"},{"seconds":"40-50","narration":"Coba ubah headline LP kamu jadi pertanyaan tentang pain audience. Comment gw bantu cek.","visual":"Speaker + on-screen CTA","broll":"Text overlay \\"COMMENT \\\\\\"AUDIT\\\\\\" \\""}],"caption":"LP-mu sepi 47 hari? Hari ini coba 1 hal yang gw share di video.","cta":"Comment AUDIT, gw cek LP kamu","soundSuggest":"Trending audio storytelling slow build, atau \\"It Girl\\" remix"}',
  },
  TIKTOK: {
    description: `TikTok video — script 15-60 detik. Vertical, fast pacing TikTok-style.
Schema: { "title": "internal title", "hook": "3 detik pertama wajib pull (max 40 char)", "scenes": [{"seconds": "0-3", "narration": "...", "visual": "...", "broll": "..."}, ...], "caption": "caption max 150 char", "cta": "CTA in video atau caption", "soundSuggest": "trending sound atau original" }
TikTok lebih cepat: hook 1-2 detik, transition cepat, text on-screen banyak.`,
    example: '{"title":"TikTok: contrarian LP advice","hook":"LP kamu jangan dibuat keren.","scenes":[{"seconds":"0-2","narration":"LP kamu jangan dibuat keren.","visual":"POV speaker shocked face camera","broll":"Bold text \\"JANGAN KEREN?\\""},{"seconds":"2-8","narration":"Iya. Yg keren design-nya seringkali sepi. Yg jelek tapi clear, malah convert.","visual":"Split screen LP keren vs LP simple, pointer ke conversion %","broll":"Animation arrow pointing ke convert numbers"},{"seconds":"8-20","narration":"Buktinya: LP gw paling convert tampilannya kayak Word doc 1995. Tapi headline-nya jawab pain audience langsung.","visual":"Cut ke LP screenshot ugly tapi clear, zoom in headline","broll":"Comment overlay \\"NO WAY\\""},{"seconds":"20-30","narration":"Save video ini sebelum lupa. Coba audit LP kamu — design fancy boleh, tapi clarity nomor 1.","visual":"Speaker direct, hand pointing","broll":"Text \\"SAVE INI\\" + arrow"}],"caption":"LP keren ≠ LP convert. Save kalau setuju.","cta":"Comment \\"BUKTI\\" gw kirim case study","soundSuggest":"Original or any contrarian-take trending sound"}',
  },
}

function buildPrompt(input: {
  channel: Channel
  funnelStage: 'TOFU' | 'MOFU' | 'BOFU'
  idea: IdeaSnippet
  ctx: BriefContext
}): string {
  const schema = CHANNEL_SCHEMAS[input.channel]
  const ctxLines = [
    input.ctx.lpTitle ? `Produk/LP: ${input.ctx.lpTitle}` : null,
    input.ctx.lpContentSnippet
      ? `Konteks LP (cuplikan):\n${input.ctx.lpContentSnippet}`
      : null,
    input.ctx.manualTitle ? `Produk/topic manual: ${input.ctx.manualTitle}` : null,
    input.ctx.manualAudience ? `Target audience: ${input.ctx.manualAudience}` : null,
    input.ctx.manualOffer ? `Offer/penawaran: ${input.ctx.manualOffer}` : null,
    `Tone: ${input.ctx.tone}`,
  ]
    .filter(Boolean)
    .join('\n')

  return `KONTEKS:
${ctxLines}

IDE YG MAU JADI KONTEN:
- Hook angle: ${input.idea.hook}
- Sudut: ${input.idea.angle}
- Kenapa works: ${input.idea.whyItWorks}
- Funnel: ${input.funnelStage}

CHANNEL: ${input.channel}
FORMAT: ${schema.description}

CONTOH OUTPUT VALID untuk channel ini:
${schema.example}

TUGAS: hasilkan 1 ContentPiece untuk channel ${input.channel} berdasarkan ide di atas. Output HARUS JSON valid sesuai schema.`
}

// ─────────────────────── AI call + parse ───────────────────────

interface GenerationResult {
  bodyJson: object
  title: string
  inputTokens: number
  outputTokens: number
}

async function callAi(prompt: string, channel: Channel): Promise<GenerationResult> {
  const client = getAnthropicClient()
  const response = (await Promise.race([
    client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: MAX_OUTPUT_TOKENS,
      system: COMMON_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    }),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`AI timeout ${AI_TIMEOUT_MS / 1000}s (${channel})`)),
        AI_TIMEOUT_MS,
      ),
    ),
  ])) as Anthropic.Messages.Message

  const text = response.content
    .filter((b: Anthropic.ContentBlock): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()

  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>
  } catch (err) {
    throw new Error(
      `Parse JSON gagal channel=${channel}: ${err instanceof Error ? err.message : String(err)}. Raw: ${cleaned.slice(0, 200)}`,
    )
  }
  const title =
    typeof parsed.title === 'string' && parsed.title.trim()
      ? parsed.title.trim().slice(0, 200)
      : `Konten ${channel}`
  return {
    bodyJson: parsed,
    title,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  }
}

// ─────────────────────── Main: generate piece dari idea ───────────────────────

export async function generatePieceFromIdea(input: {
  userId: string
  briefId: string
  ideaId: string
  channel: Channel
}): Promise<{
  piece: { id: string; title: string; tokensCharged: number } | null
  status: 'OK' | 'INSUFFICIENT_BALANCE' | 'IDEA_NOT_FOUND' | 'BRIEF_NOT_FOUND'
  errorMessage?: string
}> {
  const idea = await prisma.contentIdea.findFirst({
    where: { id: input.ideaId, userId: input.userId },
  })
  if (!idea) return { piece: null, status: 'IDEA_NOT_FOUND' }

  const brief = await prisma.contentBrief.findFirst({
    where: { id: input.briefId, userId: input.userId },
    include: {
      lp: { select: { title: true, htmlContent: true } },
    },
  })
  if (!brief) return { piece: null, status: 'BRIEF_NOT_FOUND' }

  // Pre-flight estimate dari idea.estimatedTokens (default 800).
  const preCheck = await computeChargeFromUsage({
    featureKey: FEATURE_KEY,
    inputTokens: 4_000,
    outputTokens: idea.estimatedTokens,
  })
  const ok = await hasEnoughBalance(input.userId, preCheck.tokensCharged)
  if (!ok) {
    await logGeneration({
      featureKey: FEATURE_KEY,
      userId: input.userId,
      subjectType: 'CONTENT_PIECE',
      subjectId: input.ideaId,
      charge: { ...preCheck, inputTokens: 0, outputTokens: 0, apiCostUsd: 0, apiCostRp: 0, profitRp: 0, marginPct: 0, revenueRp: 0 },
      status: 'INSUFFICIENT_BALANCE',
      errorMessage: `Saldo kurang. Butuh ±${preCheck.tokensCharged} token`,
    })
    return { piece: null, status: 'INSUFFICIENT_BALANCE' }
  }

  // Build prompt + AI call.
  const ctx: BriefContext = {
    briefId: brief.id,
    lpTitle: brief.lp?.title,
    lpContentSnippet: brief.lp?.htmlContent
      ? stripHtmlSnippet(brief.lp.htmlContent, 1500)
      : undefined,
    manualTitle: brief.manualTitle ?? undefined,
    manualAudience: brief.manualAudience ?? undefined,
    manualOffer: brief.manualOffer ?? undefined,
    tone: brief.tone,
  }
  const prompt = buildPrompt({
    channel: input.channel,
    funnelStage: idea.funnelStage as 'TOFU' | 'MOFU' | 'BOFU',
    idea: {
      hook: idea.hook,
      angle: idea.angle,
      whyItWorks: idea.whyItWorks,
      funnelStage: idea.funnelStage as 'TOFU' | 'MOFU' | 'BOFU',
    },
    ctx,
  })

  let aiRes: GenerationResult
  try {
    aiRes = await callAi(prompt, input.channel)
  } catch (err) {
    await logGeneration({
      featureKey: FEATURE_KEY,
      userId: input.userId,
      subjectType: 'CONTENT_PIECE',
      subjectId: input.ideaId,
      charge: { ...preCheck, inputTokens: 0, outputTokens: 0, apiCostUsd: 0, apiCostRp: 0, profitRp: 0, marginPct: 0, revenueRp: 0 },
      status: 'FAILED',
      errorMessage: err instanceof Error ? err.message : String(err),
    })
    return {
      piece: null,
      status: 'OK',
      errorMessage: err instanceof Error ? err.message : 'AI generation gagal',
    }
  }

  const charge = await computeChargeFromUsage({
    featureKey: FEATURE_KEY,
    inputTokens: aiRes.inputTokens,
    outputTokens: aiRes.outputTokens,
  })

  // Atomic deduct.
  const dedRes = await deductTokenAtomic({
    userId: input.userId,
    tokensCharged: charge.tokensCharged,
    description: `Content Generation (${input.channel})`,
    reference: input.ideaId,
  })

  if (!dedRes.ok) {
    await logGeneration({
      featureKey: FEATURE_KEY,
      userId: input.userId,
      subjectType: 'CONTENT_PIECE',
      subjectId: input.ideaId,
      charge,
      status: 'INSUFFICIENT_BALANCE',
      errorMessage: 'Race: saldo turun mid-flow',
    })
    return { piece: null, status: 'INSUFFICIENT_BALANCE' }
  }

  // Persist piece + slides kalau IG_CAROUSEL.
  const format = mapChannelToFormat(input.channel)
  const piece = await prisma.contentPiece.create({
    data: {
      userId: input.userId,
      briefId: input.briefId,
      sourceIdeaId: input.ideaId,
      channel: input.channel,
      funnelStage: idea.funnelStage,
      format,
      title: aiRes.title,
      bodyJson: aiRes.bodyJson,
      status: 'DRAFT',
      tokensCharged: charge.tokensCharged,
    },
    select: { id: true, title: true, tokensCharged: true },
  })

  // Update idea.promotedToPieceId for tracking.
  await prisma.contentIdea.update({
    where: { id: input.ideaId },
    data: { promotedToPieceId: piece.id },
  })

  // Persist slides untuk IG_CAROUSEL kalau output punya array slides.
  if (input.channel === 'IG_CAROUSEL') {
    const body = aiRes.bodyJson as { slides?: Array<{ headline?: string; body?: string }> }
    if (Array.isArray(body.slides)) {
      await prisma.$transaction(
        body.slides.map((s, idx) =>
          prisma.contentSlide.create({
            data: {
              pieceId: piece.id,
              slideIndex: idx,
              headline: String(s.headline ?? '').slice(0, 200),
              body: String(s.body ?? '').slice(0, 2000),
            },
          }),
        ),
      )
    }
  }

  await logGeneration({
    featureKey: FEATURE_KEY,
    userId: input.userId,
    subjectType: 'CONTENT_PIECE',
    subjectId: piece.id,
    charge,
    status: 'OK',
  })

  return { piece, status: 'OK' }
}

function mapChannelToFormat(channel: Channel): string {
  switch (channel) {
    case 'IG_CAROUSEL':
      return 'CAROUSEL'
    case 'IG_REELS':
    case 'TIKTOK':
      return 'VIDEO_SCRIPT'
    case 'IG_POST':
      return 'SINGLE_IMAGE'
    case 'WA_STATUS':
    case 'IG_STORY':
    default:
      return 'TEXT'
  }
}

function stripHtmlSnippet(html: string, max: number): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}
