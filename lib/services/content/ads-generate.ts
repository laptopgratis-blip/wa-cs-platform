// Ads Creative Generator — convert ContentIdea → ContentPiece bertipe ADS
// dengan multi-variant copy (5 headlines, 3 primary text), visual brief, dan
// storyboard untuk video ads. Channel: META_ADS atau TIKTOK_ADS.
//
// Flow:
//   1. Load idea + brief
//   2. Pre-flight balance check (ADS_GENERATE config)
//   3. AI call dengan platform+format-aware prompt
//   4. Parse JSON output strict
//   5. Atomic deduct + log
//   6. Persist ContentPiece + AdVariant rows (HEADLINE × N, PRIMARY_TEXT × N,
//      DESCRIPTION × 1, CTA × 1)
import type Anthropic from '@anthropic-ai/sdk'

import { getAnthropicClient } from '@/lib/anthropic'
import { prisma } from '@/lib/prisma'

import {
  computeChargeFromUsage,
  deductTokenAtomic,
  hasEnoughBalance,
  logGeneration,
} from '../ai-generation-log'

const FEATURE_KEY = 'ADS_GENERATE'
const AI_TIMEOUT_MS = 120_000
const MAX_OUTPUT_TOKENS = 6_000

export type AdsPlatform = 'META_ADS' | 'TIKTOK_ADS'
export type AdsFormat = 'IMAGE' | 'VIDEO' | 'CAROUSEL'

interface AdsBody {
  headlines: string[]
  primaryTexts: string[]
  description: string
  ctaButton: string
  visualBrief: {
    vibe: string
    colorPalette: string
    composition: string
    keyVisuals: string[]
    overlayCopy: string
  }
  storyboard?: { seconds: string; visual: string; voiceover?: string; onScreenText?: string }[]
  targetingHint?: { interests: string[]; behavioral: string[] }
}

const SYSTEM_PROMPT = `Kamu adalah ads creative strategist untuk Meta Ads (Facebook/Instagram) & TikTok Ads, fokus pasar Indonesia. Output bahasa Indonesia conversational, audience UMKM/seller online.

Aturan KETAT:
- Hook 3 detik pertama wajib stop scroll. Spesifik, bukan generic
- JANGAN over-claim atau bikin klaim kesehatan/kecantikan yg tidak verifiable (Meta/TikTok policy)
- JANGAN gunakan superlatif "terbaik", "nomor 1" tanpa data backing
- Variasi headline: tone berbeda (curiosity, benefit, social proof, scarcity, contrarian)
- CTA button HANYA dari list yg disediakan platform (lihat schema)
- Output HANYA JSON valid sesuai schema, no markdown fence, no preamble`

// Meta Ads CTA buttons (limited list per Meta policy)
const META_CTA_OPTIONS = [
  'SHOP_NOW',
  'LEARN_MORE',
  'SIGN_UP',
  'GET_OFFER',
  'CONTACT_US',
  'BOOK_NOW',
  'DOWNLOAD',
  'GET_QUOTE',
  'SEND_MESSAGE',
  'SUBSCRIBE',
  'APPLY_NOW',
]
// TikTok Ads CTA buttons
const TIKTOK_CTA_OPTIONS = [
  'SHOP_NOW',
  'LEARN_MORE',
  'SIGN_UP',
  'DOWNLOAD',
  'CONTACT_US',
  'WATCH_NOW',
  'GET_QUOTE',
  'BOOK_NOW',
  'APPLY_NOW',
]

interface PlatformSpec {
  description: string
  ctaList: string[]
  schema: string
  example: string
}

const PLATFORM_SPECS: Record<AdsPlatform, Record<AdsFormat, PlatformSpec>> = {
  META_ADS: {
    IMAGE: {
      description:
        'Meta Ads single image. Format 1:1 atau 4:5. Headline max 27 char. Primary text max 125 char (sebelum "See more"). Description 27 char.',
      ctaList: META_CTA_OPTIONS,
      schema: `{
  "headlines": ["5 variant headline max 27 char each, tone berbeda"],
  "primaryTexts": ["3 variant primary text max 125 char, hook kuat di 25 char pertama"],
  "description": "1 short desc max 27 char (deskripsi link bawah headline)",
  "ctaButton": "1 dari: ${META_CTA_OPTIONS.join('/')}",
  "visualBrief": { "vibe": "mood aesthetic", "colorPalette": "hint warna primer+aksen", "composition": "layout 1 kalimat", "keyVisuals": ["elemen visual 3-5 item"], "overlayCopy": "text on-image headline overlay max 8 kata" }
}`,
      example: `{"headlines":["LP Sepi? Coba Ini","Bikin LP 2 Menit","DM Naik 47%","Gratis, Tanpa Designer","Setup AI Pertama"],"primaryTexts":["LP-mu udah keren tapi sepi DM? Bukan design, bukan harga. Yang bikin orang nggak DM = headline gak jawab pain. Hulao bikin LP gratis, AI auto-tulis yg langsung convert.","Stop bayar designer Rp 5jt buat LP yg masih flop. Hulao AI generate LP custom 2 menit. 850+ seller udah pakai. Coba gratis hari ini.","Real talk: 47 DM seminggu cuma karena ganti 1 baris di LP. Sisanya gak diutak-atik. Hulao kasih AI nyari kalimat itu buatmu — gratis."],"description":"Bikin LP convert 2 menit","ctaButton":"LEARN_MORE","visualBrief":{"vibe":"trustworthy professional, slight playful","colorPalette":"orange #ea580c primary, cream warm bg, dark navy text","composition":"split-screen before/after LP, dgn data 47 DM angka besar di tengah","keyVisuals":["LP screen sebelum (sepi)","LP screen sesudah (DM masuk)","arrow transformasi","logo Hulao kecil pojok kanan bawah","angka 47 DM bold"],"overlayCopy":"DARI 0 DM JADI 47 DM"}}`,
    },
    VIDEO: {
      description:
        'Meta Ads video. 9:16 (Reels/Story) atau 1:1 (Feed). Durasi 15-30 detik optimal. Hook 3 detik wajib. Caption masuk primary text.',
      ctaList: META_CTA_OPTIONS,
      schema: `{
  "headlines": ["5 variant headline max 27 char"],
  "primaryTexts": ["3 variant primary text max 125 char (jadi caption video)"],
  "description": "1 short desc max 27 char",
  "ctaButton": "1 dari: ${META_CTA_OPTIONS.join('/')}",
  "visualBrief": { "vibe": "...", "colorPalette": "...", "composition": "...", "keyVisuals": ["..."], "overlayCopy": "text overlay frame pertama" },
  "storyboard": [{"seconds": "0-3", "visual": "yang ditampilkan di frame", "voiceover": "narasi suara (kosong kalau silent)", "onScreenText": "text yg muncul di layar"}]
}
Storyboard 4-6 scene total durasi 15-30s. Scene 0-3 detik = hook wajib pull.`,
      example: `{"headlines":["DM Naik 47x","Stop LP Flop","2 Menit, LP Jadi","Hulao AI Gratis","Coba 0 Risiko"],"primaryTexts":["Posting 30 hari, 2 DM masuk. Hari ke-31 ganti 1 baris LP. 47 DM dalam seminggu. Lengkapnya di video — link bio.","LP-mu mungkin keren, tapi keren ≠ convert. Yang bikin DM masuk = clarity di 3 detik pertama. Tonton video buat liat fixnya.","Gw audit 50 LP minggu ini. Pola yg sama bikin sepi. Hulao AI fix dalam 2 menit, gratis. Comment LINK gw kirim."],"description":"LP convert dalam 2 menit","ctaButton":"LEARN_MORE","visualBrief":{"vibe":"creator face-to-camera storytime, natural lighting","colorPalette":"warm tone real-life, accent orange brand","composition":"talking head 9:16 + b-roll screen recording LP edit","keyVisuals":["speaker face direct","screen LP before sepi","screen LP after DM masuk","text overlay angka 47","logo Hulao end card"],"overlayCopy":"LP GW FLOP 47 HARI"},"storyboard":[{"seconds":"0-3","visual":"speaker close-up, ekspresi shock","voiceover":"LP gw flop 47 hari berturut-turut","onScreenText":"47 HARI FLOP"},{"seconds":"3-8","visual":"split-screen LP lama vs baru","voiceover":"Hari ke-48, gw ubah 1 hal. Bukan harga, bukan produk. Headline.","onScreenText":"GW UBAH 1 HAL"},{"seconds":"8-18","visual":"screen recording DM notif masuk berturut","voiceover":"Headline lama: nama produk. Headline baru: pertanyaan ke pain audience. Hari itu juga DM 8.","onScreenText":"+47 DM/MINGGU"},{"seconds":"18-25","visual":"speaker direct + arrow ke link","voiceover":"Hulao AI bikin headline buat LP-mu otomatis. Gratis. Klik link.","onScreenText":"COBA GRATIS"}]}`,
    },
    CAROUSEL: {
      description:
        'Meta Ads carousel 3-5 cards. Tiap card: 1 image + headline + description + sub-CTA. Format 1:1.',
      ctaList: META_CTA_OPTIONS,
      schema: `{
  "headlines": ["5 variant top-level headline max 27 char (di atas carousel)"],
  "primaryTexts": ["3 variant primary text max 125 char"],
  "description": "1 short desc",
  "ctaButton": "1 dari list",
  "visualBrief": { "vibe": "...", "colorPalette": "...", "composition": "konsistensi visual antar slide", "keyVisuals": ["..."], "overlayCopy": "headline cover slide 1" },
  "storyboard": [{"seconds": "card-1", "visual": "isi card 1", "onScreenText": "headline kartu", "voiceover": "tagline 1 baris kalau ada"}]
}
Storyboard = array 3-5 card. seconds field pakai "card-N".`,
      example: `{"headlines":["3 Cara Bikin LP Convert","DM Naik Tanpa Iklan","Audit LP Gratis","850+ Seller Pakai","Setup 2 Menit"],"primaryTexts":["Carousel ini berisi 5 kesalahan LP yg bikin DM sepi. Save dulu, audit LP-mu setelah liat semua. Gratis tools di link bio.","LP keren ≠ LP convert. Slide ini show 3 hal yg konkret bikin LP-mu bisa naik DM hari ini. Tanpa redesign mahal.","Stop guess kenapa LP sepi. Carousel ini kasih checklist 5 hal yg harus ada di LP convert. Fix 1 aja udah beda."],"description":"Audit LP, gratis","ctaButton":"LEARN_MORE","visualBrief":{"vibe":"clean educational, slight bold typography","colorPalette":"cream bg, orange accent #ea580c, dark navy text","composition":"konsisten layout: angka besar atas + 1 kalimat insight + ikon","keyVisuals":["nomor besar 1-5","ikon clear per insight","accent strip orange","logo Hulao kecil bawah"],"overlayCopy":"5 KESALAHAN LP YG BIKIN SEPI DM"},"storyboard":[{"seconds":"card-1","visual":"cover slide bg orange, judul besar putih bold","onScreenText":"5 KESALAHAN LP YG BIKIN SEPI"},{"seconds":"card-2","visual":"angka 1 besar + ilustrasi headline kosong","onScreenText":"1. HEADLINE GAK JAWAB PAIN"},{"seconds":"card-3","visual":"angka 2 + diagram CTA hidden","onScreenText":"2. CTA NGUMPET DI BAWAH"},{"seconds":"card-4","visual":"angka 3 + foto produk overstyled","onScreenText":"3. FOTO TEMPLATE-AN"},{"seconds":"card-5","visual":"CTA card dgn mockup Hulao","onScreenText":"AUDIT LP-MU GRATIS — KLIK"}]}`,
    },
  },
  TIKTOK_ADS: {
    IMAGE: {
      description:
        'TikTok Ads single image (jarang dipakai, lebih ke In-feed Image). Format 9:16. Caption max 100 char.',
      ctaList: TIKTOK_CTA_OPTIONS,
      schema: `{
  "headlines": ["5 variant short hook max 25 char"],
  "primaryTexts": ["3 variant caption max 100 char, casual TikTok-style"],
  "description": "tagline pendek",
  "ctaButton": "1 dari: ${TIKTOK_CTA_OPTIONS.join('/')}",
  "visualBrief": { "vibe": "...", "colorPalette": "...", "composition": "...", "keyVisuals": ["..."], "overlayCopy": "text on image bold" }
}`,
      example: `{"headlines":["LP Sepi DM?","Fix 2 Menit","850+ Seller","Gratis Auto","Audit Gratis"],"primaryTexts":["LP-mu udah keren tapi DM zonk? bukan kamu — fix-nya satu kalimat di hook 🔥","Real talk: gw fix LP gw 1x doang, DM naik 47x. Hulao AI gratis pakai.","stop spend Rp 5jt designer LP. AI Hulao auto bikin yg convert. 2 menit doang."],"description":"LP gratis 2 menit","ctaButton":"LEARN_MORE","visualBrief":{"vibe":"native TikTok aesthetic, raw not over-polished","colorPalette":"high contrast neon orange + black","composition":"vertical 9:16 fokus center, text bold besar atas","keyVisuals":["screen LP zoom in","arrow transformation","angka 47 bold","tag #LPCONVERT"],"overlayCopy":"LP-MU SEPI? KLIK"}}`,
    },
    VIDEO: {
      description:
        'TikTok Ads in-feed video. 9:16 vertical, 9-30s sweet spot 15-21s. Hook 1-2 detik wajib pull. Native feel, NOT overproduced.',
      ctaList: TIKTOK_CTA_OPTIONS,
      schema: `{
  "headlines": ["5 variant on-screen hook (max 20 char)"],
  "primaryTexts": ["3 variant caption max 100 char dengan 2-3 hashtag"],
  "description": "tagline pendek",
  "ctaButton": "1 dari list",
  "visualBrief": { "vibe": "...", "colorPalette": "...", "composition": "...", "keyVisuals": ["..."], "overlayCopy": "text frame 1" },
  "storyboard": [{"seconds": "0-2", "visual": "...", "voiceover": "...", "onScreenText": "..."}]
}
Storyboard 4-7 scene total 9-30s. TikTok pacing CEPAT — transition tiap 2-3 detik.`,
      example: `{"headlines":["LP FLOP 47 HR","FIX 1 KATA","DM NAIK 47X","STOP DESIGNER","AI BIKIN LP"],"primaryTexts":["lp gw flop 47 hari, ganti 1 kata aja, DM 47x naik 🤯 #lpconvert #sellertips","stop bayar designer rp 5jt. Hulao AI auto generate LP yg jadi convert 2 menit. cobain.","gw test 50 LP. fix-nya cuma 1 kalimat. AI Hulao kasih jawabannya gratis."],"description":"LP gratis 2 menit","ctaButton":"LEARN_MORE","visualBrief":{"vibe":"native TikTok creator vibe, handheld POV, raw feel","colorPalette":"natural lighting, brand orange di overlay text","composition":"selfie POV + cut quick ke screen recording LP","keyVisuals":["speaker face POV","screen LP scrolling","DM notification bursts","text overlay angka","Hulao logo end card 1s"],"overlayCopy":"LP FLOP 47 HARI"},"storyboard":[{"seconds":"0-2","visual":"POV speaker shocked face, jump cut","voiceover":"LP gw flop 47 hari","onScreenText":"FLOP 47 HARI"},{"seconds":"2-5","visual":"quick zoom screen LP sepi","voiceover":"sampe gw ganti 1 kalimat","onScreenText":"GANTI 1 KALIMAT"},{"seconds":"5-9","visual":"split screen before/after, DM masuk berturut","voiceover":"DM naik 47x dalam seminggu","onScreenText":"+47 DM 🚀"},{"seconds":"9-15","visual":"speaker hand pointing ke atas, link sticker","voiceover":"Hulao AI auto bikin kalimat itu buatmu, gratis","onScreenText":"COBAIN GRATIS ↑"},{"seconds":"15-20","visual":"end card logo + CTA bar TikTok","voiceover":"klik tombol bawah","onScreenText":"LEARN MORE"}]}`,
    },
    CAROUSEL: {
      description:
        'TikTok Ads carousel (limited adoption — fallback ke video kalau gak yakin). 3-5 image vertical 9:16.',
      ctaList: TIKTOK_CTA_OPTIONS,
      schema: `{
  "headlines": ["5 variant short hook max 25 char"],
  "primaryTexts": ["3 variant caption max 100 char"],
  "description": "tagline",
  "ctaButton": "1 dari list",
  "visualBrief": { "vibe": "...", "colorPalette": "...", "composition": "...", "keyVisuals": ["..."], "overlayCopy": "headline cover" },
  "storyboard": [{"seconds": "card-1", "visual": "...", "onScreenText": "..."}]
}
Storyboard = array 3-5 card. seconds field pakai "card-N".`,
      example: `{"headlines":["LP CONVERT?","5 KESALAHAN","FIX 1 HARI","850+ SELLER","COBA GRATIS"],"primaryTexts":["swipe — 5 kesalahan LP yg bikin sepi DM. fix yg paling impact di slide 4 🔥","gw audit 50 LP. pola yg sama. carousel ini buka semuanya. save dulu.","DM-mu sepi? cek 5 hal di carousel. fix 1 aja udah beda."],"description":"audit LP gratis","ctaButton":"LEARN_MORE","visualBrief":{"vibe":"native TikTok carousel, bold typography vertical","colorPalette":"hitam BG, neon orange accent, putih text","composition":"angka besar full-bleed, 1 insight per card","keyVisuals":["nomor 1-5 besar","ikon clear","accent neon orange","Hulao logo kecil pojok"],"overlayCopy":"5 KESALAHAN LP"},"storyboard":[{"seconds":"card-1","visual":"cover hitam dengan judul besar neon","onScreenText":"5 KESALAHAN LP YG BIKIN SEPI"},{"seconds":"card-2","visual":"angka 1 besar + ikon hook kosong","onScreenText":"1. HEADLINE GENERIC"},{"seconds":"card-3","visual":"angka 2 + ikon CTA tersembunyi","onScreenText":"2. CTA NGUMPET"},{"seconds":"card-4","visual":"angka 3 highlight, glow effect","onScreenText":"3. SOCIAL PROOF NOL"},{"seconds":"card-5","visual":"CTA card link bio","onScreenText":"AUDIT GRATIS — LINK BIO"}]}`,
    },
  },
}

interface IdeaSnippet {
  hook: string
  angle: string
  whyItWorks: string
  funnelStage: 'TOFU' | 'MOFU' | 'BOFU'
}

interface BriefContext {
  briefId?: string | null
  lpTitle?: string
  lpContentSnippet?: string
  manualTitle?: string
  manualAudience?: string
  manualOffer?: string
  tone: string
}

function buildPrompt(input: {
  platform: AdsPlatform
  format: AdsFormat
  funnelStage: 'TOFU' | 'MOFU' | 'BOFU'
  idea: IdeaSnippet
  ctx: BriefContext
}): string {
  const spec = PLATFORM_SPECS[input.platform][input.format]
  const ctxLines = [
    input.ctx.lpTitle ? `Produk/LP: ${input.ctx.lpTitle}` : null,
    input.ctx.lpContentSnippet ? `Konteks LP (cuplikan):\n${input.ctx.lpContentSnippet}` : null,
    input.ctx.manualTitle ? `Produk/topic manual: ${input.ctx.manualTitle}` : null,
    input.ctx.manualAudience ? `Target audience: ${input.ctx.manualAudience}` : null,
    input.ctx.manualOffer ? `Offer/penawaran: ${input.ctx.manualOffer}` : null,
    `Tone: ${input.ctx.tone}`,
  ]
    .filter(Boolean)
    .join('\n')

  return `KONTEKS:
${ctxLines}

IDE YG MAU JADI ADS:
- Hook angle: ${input.idea.hook}
- Sudut: ${input.idea.angle}
- Kenapa works: ${input.idea.whyItWorks}
- Funnel: ${input.funnelStage}

PLATFORM: ${input.platform}
FORMAT: ${input.format}
SPEC: ${spec.description}

SCHEMA OUTPUT (HARUS DIPATUHI):
${spec.schema}

CONTOH OUTPUT VALID:
${spec.example}

TUGAS: hasilkan 1 ad creative untuk ${input.platform} format ${input.format}. Headlines harus 5 variant tone berbeda (curiosity, benefit, social proof, scarcity, contrarian). Primary texts 3 variant. Output HARUS JSON valid sesuai schema, no markdown fence.`
}

interface GenerationResult {
  body: AdsBody
  title: string
  inputTokens: number
  outputTokens: number
}

async function callAi(
  prompt: string,
  platform: AdsPlatform,
  format: AdsFormat,
): Promise<GenerationResult> {
  const client = getAnthropicClient()
  const response = (await Promise.race([
    client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`AI timeout ${AI_TIMEOUT_MS / 1000}s (${platform}/${format})`)),
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
      `Parse JSON gagal ${platform}/${format}: ${err instanceof Error ? err.message : String(err)}. Raw: ${cleaned.slice(0, 200)}`,
    )
  }

  const body = sanitizeBody(parsed, platform, format)
  const headlineSnippet = body.headlines[0] ?? `Ad ${platform}`
  const title = headlineSnippet.slice(0, 80) || `Ad ${platform} ${format}`

  return {
    body,
    title,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  }
}

function asStringArray(v: unknown, max: number, charLimit: number): string[] {
  if (!Array.isArray(v)) return []
  return v
    .map((s) => String(s ?? '').trim().slice(0, charLimit))
    .filter((s) => s.length > 0)
    .slice(0, max)
}

function sanitizeBody(
  raw: Record<string, unknown>,
  platform: AdsPlatform,
  format: AdsFormat,
): AdsBody {
  const headlines = asStringArray(raw.headlines, 5, 200)
  const primaryTexts = asStringArray(raw.primaryTexts, 3, 1000)
  const ctaList = PLATFORM_SPECS[platform][format].ctaList
  let ctaButton =
    typeof raw.ctaButton === 'string' ? raw.ctaButton.toUpperCase().trim() : 'LEARN_MORE'
  if (!ctaList.includes(ctaButton)) ctaButton = 'LEARN_MORE'

  const description =
    typeof raw.description === 'string' ? raw.description.trim().slice(0, 200) : ''

  const vbRaw = (raw.visualBrief ?? {}) as Record<string, unknown>
  const visualBrief = {
    vibe: typeof vbRaw.vibe === 'string' ? vbRaw.vibe.slice(0, 200) : '',
    colorPalette:
      typeof vbRaw.colorPalette === 'string' ? vbRaw.colorPalette.slice(0, 200) : '',
    composition:
      typeof vbRaw.composition === 'string' ? vbRaw.composition.slice(0, 300) : '',
    keyVisuals: asStringArray(vbRaw.keyVisuals, 8, 200),
    overlayCopy:
      typeof vbRaw.overlayCopy === 'string' ? vbRaw.overlayCopy.slice(0, 100) : '',
  }

  let storyboard: AdsBody['storyboard'] | undefined
  if (Array.isArray(raw.storyboard)) {
    storyboard = (raw.storyboard as unknown[])
      .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
      .map((s) => ({
        seconds: typeof s.seconds === 'string' ? s.seconds.slice(0, 30) : '',
        visual: typeof s.visual === 'string' ? s.visual.slice(0, 500) : '',
        voiceover:
          typeof s.voiceover === 'string' ? s.voiceover.slice(0, 500) : undefined,
        onScreenText:
          typeof s.onScreenText === 'string' ? s.onScreenText.slice(0, 200) : undefined,
      }))
      .filter((s) => s.visual.length > 0)
      .slice(0, 10)
  }

  // Targeting hint optional
  let targetingHint: AdsBody['targetingHint'] | undefined
  if (raw.targetingHint && typeof raw.targetingHint === 'object') {
    const th = raw.targetingHint as Record<string, unknown>
    targetingHint = {
      interests: asStringArray(th.interests, 8, 100),
      behavioral: asStringArray(th.behavioral, 8, 100),
    }
  }

  return {
    headlines: headlines.length > 0 ? headlines : ['Coba sekarang'],
    primaryTexts:
      primaryTexts.length > 0 ? primaryTexts : ['Konten ads default — re-generate.'],
    description,
    ctaButton,
    visualBrief,
    storyboard,
    targetingHint,
  }
}

// ─────────────────────── Main: generate ads piece dari idea ──────────

export async function generateAdsPieceFromIdea(input: {
  userId: string
  briefId?: string | null
  ideaId: string
  platform: AdsPlatform
  format: AdsFormat
}): Promise<{
  piece: { id: string; title: string; tokensCharged: number } | null
  status:
    | 'OK'
    | 'INSUFFICIENT_BALANCE'
    | 'IDEA_NOT_FOUND'
  errorMessage?: string
}> {
  const idea = await prisma.contentIdea.findFirst({
    where: { id: input.ideaId, userId: input.userId },
  })
  if (!idea) return { piece: null, status: 'IDEA_NOT_FOUND' }

  type BriefWithLp =
    | (NonNullable<Awaited<ReturnType<typeof prisma.contentBrief.findFirst>>> & {
        lp: { title: string; htmlContent: string } | null
      })
    | null
  let brief: BriefWithLp = null
  if (input.briefId) {
    brief = (await prisma.contentBrief.findFirst({
      where: { id: input.briefId, userId: input.userId },
      include: { lp: { select: { title: true, htmlContent: true } } },
    })) as BriefWithLp
  }
  // Fallback ke LP dari idea kalau tidak punya brief
  let lpFallback: { title: string; htmlContent: string } | null = null
  if (!brief && idea.lpId) {
    lpFallback = await prisma.landingPage.findUnique({
      where: { id: idea.lpId },
      select: { title: true, htmlContent: true },
    })
  }

  // Pre-flight estimate (ads output lebih besar dari organic — ~1500-2500 token)
  const preCheck = await computeChargeFromUsage({
    featureKey: FEATURE_KEY,
    inputTokens: 5_000,
    outputTokens: Math.max(2_000, idea.estimatedTokens * 2),
  })
  const enough = await hasEnoughBalance(input.userId, preCheck.tokensCharged)
  if (!enough) {
    await logGeneration({
      featureKey: FEATURE_KEY,
      userId: input.userId,
      subjectType: 'ADS_PIECE',
      subjectId: input.ideaId,
      charge: {
        ...preCheck,
        inputTokens: 0,
        outputTokens: 0,
        apiCostUsd: 0,
        apiCostRp: 0,
        profitRp: 0,
        marginPct: 0,
        revenueRp: 0,
      },
      status: 'INSUFFICIENT_BALANCE',
      errorMessage: `Saldo kurang. Butuh ±${preCheck.tokensCharged} token`,
    })
    return { piece: null, status: 'INSUFFICIENT_BALANCE' }
  }

  const ctx: BriefContext = {
    briefId: brief?.id ?? null,
    lpTitle: brief?.lp?.title ?? lpFallback?.title,
    lpContentSnippet: brief?.lp?.htmlContent
      ? stripHtmlSnippet(brief.lp.htmlContent, 1500)
      : lpFallback?.htmlContent
        ? stripHtmlSnippet(lpFallback.htmlContent, 1500)
        : undefined,
    manualTitle: brief?.manualTitle ?? undefined,
    manualAudience: brief?.manualAudience ?? undefined,
    manualOffer: brief?.manualOffer ?? undefined,
    tone: brief?.tone ?? 'CASUAL',
  }
  const prompt = buildPrompt({
    platform: input.platform,
    format: input.format,
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
    aiRes = await callAi(prompt, input.platform, input.format)
  } catch (err) {
    await logGeneration({
      featureKey: FEATURE_KEY,
      userId: input.userId,
      subjectType: 'ADS_PIECE',
      subjectId: input.ideaId,
      charge: {
        ...preCheck,
        inputTokens: 0,
        outputTokens: 0,
        apiCostUsd: 0,
        apiCostRp: 0,
        profitRp: 0,
        marginPct: 0,
        revenueRp: 0,
      },
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

  const dedRes = await deductTokenAtomic({
    userId: input.userId,
    tokensCharged: charge.tokensCharged,
    description: `Ads Generation (${input.platform}/${input.format})`,
    reference: input.ideaId,
  })

  if (!dedRes.ok) {
    await logGeneration({
      featureKey: FEATURE_KEY,
      userId: input.userId,
      subjectType: 'ADS_PIECE',
      subjectId: input.ideaId,
      charge,
      status: 'INSUFFICIENT_BALANCE',
      errorMessage: 'Race: saldo turun mid-flow',
    })
    return { piece: null, status: 'INSUFFICIENT_BALANCE' }
  }

  // Persist piece + variants. Format detail di field format (mirror organic)
  const formatLabel = `ADS_${input.format}` // ADS_IMAGE | ADS_VIDEO | ADS_CAROUSEL
  const piece = await prisma.contentPiece.create({
    data: {
      userId: input.userId,
      briefId: input.briefId ?? null,
      sourceIdeaId: input.ideaId,
      channel: input.platform,
      funnelStage: idea.funnelStage,
      format: formatLabel,
      title: aiRes.title,
      bodyJson: aiRes.body as unknown as object,
      status: 'DRAFT',
      tokensCharged: charge.tokensCharged,
      pieceType: 'ADS',
      adsPlatform: input.platform,
      adsFormat: input.format,
    },
    select: { id: true, title: true, tokensCharged: true },
  })

  // Update idea promote tracking
  await prisma.contentIdea.update({
    where: { id: input.ideaId },
    data: { promotedToPieceId: piece.id },
  })

  // Persist variants — headlines + primary texts + description + cta
  const variantData: { variantType: string; value: string; order: number }[] = []
  aiRes.body.headlines.forEach((v, i) =>
    variantData.push({ variantType: 'HEADLINE', value: v, order: i }),
  )
  aiRes.body.primaryTexts.forEach((v, i) =>
    variantData.push({ variantType: 'PRIMARY_TEXT', value: v, order: i }),
  )
  if (aiRes.body.description) {
    variantData.push({ variantType: 'DESCRIPTION', value: aiRes.body.description, order: 0 })
  }
  if (aiRes.body.ctaButton) {
    variantData.push({ variantType: 'CTA', value: aiRes.body.ctaButton, order: 0 })
  }
  if (variantData.length > 0) {
    await prisma.adVariant.createMany({
      data: variantData.map((v) => ({ ...v, pieceId: piece.id })),
    })
  }

  await logGeneration({
    featureKey: FEATURE_KEY,
    userId: input.userId,
    subjectType: 'ADS_PIECE',
    subjectId: piece.id,
    charge,
    status: 'OK',
  })

  return { piece, status: 'OK' }
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

export { META_CTA_OPTIONS, TIKTOK_CTA_OPTIONS }
