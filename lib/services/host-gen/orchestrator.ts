// Host Prompt Orchestrator — Claude bantu user bikin prompt host yg
// OPTIMAL untuk pipeline Gemini → Kling looping:
//   - Komposisi WAJIB: medium shot 3/4 body, host CENTERED, vertical 9:16,
//     not too big in frame (head occupies ~25% height max).
//   - Background simple supaya gerakan loop seamless.
//   - Motion prompt WAJIB: subtle, kembali ke pose awal di akhir, kamera
//     completely static (no pan/zoom/cut), hands return to neutral.
//
// User pilih karakter via opsi terstruktur. Orchestrator translate ke prompt
// detail yg memenuhi constraint di atas.

import Anthropic from '@anthropic-ai/sdk'

import { prisma } from '@/lib/prisma'
import { executeAiWithCharge } from '@/lib/services/ai-generation-log'

import { getLiveApiKey } from '../live/provider-keys'

const FEATURE_KEY = 'HOST_PROMPT_ORCHESTRATE'
const MODEL = 'claude-haiku-4-5'
const MAX_OUTPUT = 1200

export type Gender = 'female' | 'male'
export type AgeRange = 'young' | 'adult' | 'mature' // 20s, 30s, 40s+
export type Outfit = 'hijab_casual' | 'hijab_formal' | 'non_hijab_casual' | 'non_hijab_formal' | 'tshirt_jeans'
export type Vibe = 'friendly' | 'professional' | 'energetic' | 'calm'
export type Background = 'studio_white' | 'studio_warm' | 'retail_shop' | 'home_cozy' | 'outdoor_bright' | 'gradient_soft'
export type MotionIntensity = 'subtle' | 'moderate' | 'energetic'
export type ArtStyle =
  | 'photoreal_natural' // photoreal with anti-plastic guards (default)
  | 'photoreal_cinematic' // photoreal dramatic lighting
  | 'pixar_3d' // 3D animated Pixar/Disney
  | 'realistic_3d' // CGI Unreal Engine 5 level
  | 'anime_modern' // modern anime / Korean webtoon
  | 'painterly' // watercolor painted
  | 'ghibli' // Ghibli watercolor anime

export interface OrchestrateInput {
  userId: string
  gender: Gender
  ageRange: AgeRange
  outfit: Outfit
  vibe: Vibe
  background: Background
  motionIntensity: MotionIntensity
  artStyle: ArtStyle
  // Optional: produk yang ditampilkan host. ID milik user (di-validate).
  productIds?: string[]
  // Optional: catatan bebas dari user — tambah konteks (mis. "asal Bandung",
  // "rambut diikat", "etnis Jawa").
  extraNote?: string
  // Sprint 5: Klip Live mode — preset IDs untuk inject promptFragment ke Gemini.
  // Kalau diisi, override background enum standar di atas.
  visualHookPresetId?: string | null
  backgroundPresetId?: string | null
  // Sprint 5+: Mode bicara host. NATIVE_LIBRARY = Klip Live, baseline harus
  // ENERGETIC (banyak gerakan tangan + body language) supaya lipsync clips
  // inherit active motion. TTS_GENERATIVE = baseline static (existing).
  hostMode?: 'TTS_GENERATIVE' | 'NATIVE_LIBRARY'
}

export interface OrchestrateOutput {
  promptImage: string
  promptVideo: string
  suggestedName: string
  visualStyle: string
  // Saran caption singkat untuk live room greeting (opsional dipakai).
  suggestedGreeting: string
  // Produk yang ter-resolve (image URL) — front-end pakai sebagai refImageUrls
  // saat submit ke endpoint create host.
  productImageUrls: string[]
}

const BEGIN = '<<<HOST_PROMPT>>>'
const END = '<<<END>>>'

const GENDER_LABEL: Record<Gender, string> = {
  female: 'Indonesian female',
  male: 'Indonesian male',
}
const AGE_LABEL: Record<AgeRange, string> = {
  young: '22-26 years old',
  adult: '28-35 years old',
  mature: '38-45 years old',
}
const OUTFIT_LABEL: Record<Outfit, string> = {
  hijab_casual: 'modern casual hijab outfit (soft pastel)',
  hijab_formal: 'elegant formal hijab outfit (neutral tones)',
  non_hijab_casual: 'casual outfit, hair tied or styled neatly',
  non_hijab_formal: 'professional smart casual, blouse or shirt',
  tshirt_jeans: 'simple branded t-shirt and jeans, retail uniform style',
}
const VIBE_LABEL: Record<Vibe, string> = {
  friendly: 'warm friendly smile, approachable, eye contact with camera',
  professional: 'confident professional expression, slight smile, composed',
  energetic: 'cheerful enthusiastic energy, bright smile, eyes lit',
  calm: 'calm reassuring expression, soft smile, patient demeanor',
}
const BACKGROUND_LABEL: Record<Background, string> = {
  studio_white: 'clean off-white studio backdrop with soft diffuse lighting',
  studio_warm: 'warm peach gradient studio backdrop, soft key light',
  retail_shop: 'minimalist retail shop interior, blurred merchandise behind',
  home_cozy: 'cozy home living-room setting, warm ambient lighting',
  outdoor_bright: 'bright outdoor cafe terrace, soft bokeh background',
  gradient_soft: 'soft pastel orange-to-pink gradient background',
}
const MOTION_INTENSITY_LABEL: Record<MotionIntensity, string> = {
  subtle:
    'very subtle natural micro-movements: slight head nods, gentle blinks, soft smiles. Hand stays mostly in resting position with occasional small open-palm gestures. Should look like a real person standing patiently.',
  moderate:
    'natural conversational movement: small head turns, occasional emphatic but tasteful open-palm hand gestures, friendly nods. Like an enthusiastic salesperson explaining gently.',
  energetic:
    'lively but tasteful body language: light body sway, hands moving expressively (always sopan/modest, no large arm raises), engaging head movements. Like a TV presenter at moderate energy.',
}

// ── ART STYLE — paling penting, ini yg pengaruhi hasil "natural" vs "plastic AI"
const ART_STYLE_LABEL: Record<ArtStyle, string> = {
  photoreal_natural:
    'PHOTOREALISTIC PORTRAIT, anti-AI-plastic. WAJIB: natural skin texture with visible pores, subtle imperfections, soft skin redness in cheeks and ears, fine baby hair flyaways at hairline edge (not perfectly smooth hairline), eyelashes individually visible, iris with detailed pattern and natural reflection, hair strands with natural texture (not silky CG sheen), soft natural lighting that preserves micro-detail, asymmetric facial features (not perfectly symmetric), slight skin highlights ONLY where naturally occurring, true-to-life color of Indonesian skin tone. NEGATIVE PROMPT MUST INCLUDE: smooth airbrushed skin, plastic doll skin, perfect symmetric face, glossy waxy texture, uncanny valley, AI-perfect, retouched advertising look, mannequin, CGI render.',
  photoreal_cinematic:
    'CINEMATIC PHOTOREALISTIC PORTRAIT, magazine quality. WAJIB: natural skin texture with visible pores and subtle freckles, realistic hairline with flyaway baby hairs, soft natural rim lighting + key light, shallow depth of field with subtle bokeh background, warm color grading (cinema LUT), film-grain feel, natural skin tones. NEGATIVE: plastic skin, smooth airbrushed, AI-glossy, doll face.',
  pixar_3d:
    '3D animated character in Pixar / Disney / DreamWorks animation style. Stylized but professional render: subsurface scattering on skin, soft cel-shading + smooth gradients, large expressive eyes (slightly bigger than realistic), warm bright color palette, friendly cartoonish proportions, polished animated film quality. NOT photorealistic — clearly cartoon.',
  realistic_3d:
    'PHOTOREALISTIC 3D CGI character, Unreal Engine 5 cinematic render quality. WAJIB: hyper-detailed subsurface scattering skin, individual pore visible, hair strands individually rendered (not card-based), accurate eye reflections and refraction, soft global illumination, high-end real-time render look. Should look indistinguishable from photo at glance. NEGATIVE: cartoon, anime, plastic.',
  anime_modern:
    'Modern anime / Korean webtoon portrait illustration. Clean digital line art, soft cel shading with smooth gradients, expressive large almond-shaped eyes, natural skin tone palette, professional digital painting quality, vertical 9:16 vtuber-ready composition. Style references: modern Korean webtoon (Noh Miyoung), anime visual novels.',
  painterly:
    'Painterly portrait illustration, hand-painted feel. Soft visible brush strokes, watercolor-like washes, expressive but stylized, warm pastel palette, slight texture on canvas, illustrated storybook quality. Not photorealistic — clearly painted.',
  ghibli:
    'Studio Ghibli watercolor anime style portrait. Hand-painted feel with soft watercolor washes, gentle expression with small detailed eyes (Ghibli proportions, not big anime eyes), warm pastel color palette, anime film background aesthetic, hand-drawn line work. Style references: Ghibli films, Mamoru Hosoda.',
}

const ART_STYLE_USER_LABEL: Record<ArtStyle, string> = {
  photoreal_natural: 'Photoreal natural (anti-plastik AI, hairline + texture detail)',
  photoreal_cinematic: 'Photoreal cinematic (lighting dramatis, magazine look)',
  pixar_3d: '3D Pixar (animasi kartun stylized)',
  realistic_3d: '3D Realistic (CGI level Unreal Engine 5)',
  anime_modern: 'Anime modern / Korean webtoon',
  painterly: 'Painterly (watercolor illustration)',
  ghibli: 'Studio Ghibli watercolor',
}

function buildSystemPrompt(klipLiveMode = false): string {
  return `Kamu adalah expert AI image+video director untuk Hulao CS Live AI. Tugasmu: terjemahkan opsi user jadi PROMPT optimal untuk pipeline Gemini Nano Banana 2 (image) → Kling AI (image-to-video).

ATURAN WAJIB hasil prompt:

1. KOMPOSISI gambar — HOST KECIL, CENTER, SIMETRIS, FRONTAL (CRITICAL, baca dua kali):
   - Vertical 9:16 frame (mobile live shopping).
   - Host CENTERED di tengah frame, baik horizontal maupun vertical.
   - WIDE / MEDIUM-WIDE SHOT: FULL BODY visible dari kepala sampai paha atau lutut.
   - Kepala WAJIB KECIL: tinggi kepala HANYA 12-18% dari tinggi frame.
   - WAJIB ada negative space yang lega di ATAS, BAWAH, KIRI, KANAN host (minimal 15% margin tiap sisi).
   - WAJIB MENGHADAP KAMERA LURUS 100% FRONTAL (0°). Bahu PARALEL dengan frame. DILARANG 3/4 angle, profile, side view, twist torso, head tilt. Wajah lurus ke depan, dagu netral, mata kontak kamera.
   - POSTUR SIMETRIS SEMPURNA: bahu kiri & kanan sejajar (tidak satu lebih tinggi), pinggul rata, weight terbagi sama di kedua kaki, tulang belakang tegak vertikal. Centerline tubuh = centerline frame.
   - KAKI PARALEL: kedua kaki menapak rata di lantai, jarak selebar bahu, ujung kaki menghadap kamera. DILARANG cross legs, contrapposto, hip pop, lean, kaki silang, satu kaki maju, weight shift ke satu sisi.
   - TANGAN SIMETRIS: kedua tangan dalam posisi seimbang relatif terhadap garis tengah tubuh (rileks sejajar di samping, atau dua tangan memegang produk di depan dada). DILARANG satu tangan di pinggang sementara yang lain menjuntai.
   - Alasan SIMETRI: Kling looping anim akan kembali ke frame awal — kalau pose awal asimetris/menyamping/kaki silang, transisi loop NYENTAK & TIDAK SEAMLESS.
   - Alasan FRAME KECIL: mulut bergerak halus saat loop — host kecil supaya mismatch lip-sync TTS tidak kentara.
   - Background simple (sesuai opsi), simetris kalau bisa (tembok polos / gradient center), tidak boleh ada elemen ribet di sekitar host.
   - No text/watermark/logo di gambar.

2. ART STYLE — IKUTI PERSIS instruksi style yang dikirim user:
   - User akan kirim deskripsi art style yang sangat spesifik dengan keyword negatif.
   - Kamu HARUS embed deskripsi style itu (termasuk negative prompts) ke dalam promptImage.
   - JANGAN ganti style ke default photoreal kalau user pilih pixar/anime/painterly.
   - Untuk style photoreal: WAJIB include anti-plastic-AI keywords: "visible skin pores", "fine baby hairs at hairline", "natural skin texture not airbrushed", "individual eyelashes", dan negative prompt "NOT plastic doll skin, NOT smooth airbrushed, NOT AI-glossy, NOT uncanny valley".
   - Untuk style 3D/CGI: include "subsurface scattering, individually rendered hair strands, detailed pore texture".
   - Untuk style anime/painterly: jangan campur dengan keyword photoreal — biarkan style murni.

3. MOTION prompt untuk Kling — ${klipLiveMode ? 'ENERGETIC baseline (Klip Live mode)' : 'DEFAULT static loop (TTS host mode)'}:
   - Camera COMPLETELY STATIC: no pan, zoom, dolly, or cut.
   - WAJIB include keywords: "silent video, no audio, no sound, no speech, no lip-sync, mouth subtly closed or with gentle smile only, NOT attempting to form words".
   ${klipLiveMode ? `
   KLIP LIVE BASELINE (untuk Kling lipsync nanti — lipsync HANYA animate mulut,
   jadi gerakan badan/tangan HARUS sudah ada di baseline ini):
   - WAJIB ACTIVE BODY MOTION sepanjang klip — bukan idle subtle.
   - HANDS: kedua tangan bergerak aktif konversasional — wave warmly outward,
     raise to chest level palm-up emphasis, sweeping welcoming gesture, point
     softly toward camera, return to start position by end. Tangan TIDAK boleh
     diam di samping seperti patung.
   - HEAD: bobs and tilts side-to-side rhythmically, raised eyebrows on emphasis,
     friendly nods, occasional warm head tilt.
   - BODY: subtle bouncy lean forward toward camera, shoulders shift with each
     gesture, visible breathing.
   - FACE: bright animated smile, expressive eyebrows raised, eyes wide engaging.
   - Vibe target: Indonesian TikTok Live / Shopee Live shopping host energy.
   - Loop kembali ke STARTING POSE di frame terakhir (similar hand position +
     facial expression) — tidak perlu identik, cukup mirip supaya loop smooth.
   - SIMETRI tetap dijaga tapi DENGAN motion (kedua tangan bergerak mirrored/
     bilateral OK), pose dasar facing 0° frontal, kaki paralel.
   - WAJIB lawan: "stiff", "frozen", "static body", "hands at sides motionless",
     "robotic" — host harus terlihat ALIVE.` : `
   DEFAULT STATIC LOOP (TTS host — silent video di-overlay TTS audio realtime
   di client, mouth area kecil di frame jadi gak kentara):
   - Mulut: hanya gerakan halus alami (breathing, slight smile shifts) — JANGAN
     buka-tutup seperti orang ngomong.
   - Host minimal motion: subtle head nods, gentle blinks, soft micro-movements.
   - WAJIB return to EXACT starting pose / neutral position di frame TERAKHIR
     clip supaya loop seamless (final frame == first frame, posisi identik).
   - Hands kembali ke posisi awal.
   - SIMETRI WAJIB DIPERTAHANKAN: kaki paralel, bahu paralel frame, kepala TIDAK
     menengok >5°. Gerakan tangan mirrored bilateral atau micro-only.
   - Tidak boleh: "turn to side", "look away", "cross legs", "shift weight",
     "lean", "step forward", "twist body" — semua merusak loop.`}
   - Motion prompt netral terhadap art style — animasi loop fisik, bukan art-direction.

4. STRUKTUR promptImage (~140-240 kata):
   - Mulai dengan style label (mis: "Photorealistic portrait, anti-AI-plastic look:" atau "3D Pixar animated character:").
   - Lalu deskripsi karakter (gender, age, outfit, ekspresi, vibe).
   - Lalu komposisi WAJIB include literal: "Full body wide-medium shot, vertical 9:16 frame, head occupies only 12-18% of frame height (host small in frame with generous negative space above and below for looping animation safety). Subject is perfectly CENTERED horizontally and vertically. Camera angle: 100% frontal, dead-center, zero degrees, shoulders parallel to frame, hips square to camera, spine perfectly vertical. Pose is BILATERALLY SYMMETRIC: both feet flat on ground parallel and shoulder-width apart with toes pointing directly at camera, weight evenly distributed on both legs, both arms in mirrored relaxed position at sides (or both hands together in front holding product). No contrapposto, no weight shift, no hip pop, no leg cross, no body twist, no head tilt, no 3/4 angle."
   - Lalu background (sebisa mungkin simetris: solid wall, centered gradient, atau bilateral-symmetric scene).
   - Lalu lighting spesifik untuk style itu (front-on flat or soft frontal lighting — JANGAN side rim light yang bikin asimetri).
   - DI AKHIR: blok "Negative prompt: ..." WAJIB include: "extreme close-up, head shot, portrait close, face close-up, large head in frame, side view, profile view, 3/4 angle, three-quarter angle, turned to the side, facing sideways, body twist, torso rotation, head tilt, looking away, off-center, asymmetric pose, asymmetrical stance, contrapposto, weight on one leg, hip pop, leaning, crossed legs, legs crossed, one foot forward, staggered stance, hand on hip while other hand down, asymmetric arms" — plus negative prompts khusus style (sesuai instruksi style user).

OUTPUT WAJIB JSON murni (tidak ada markdown/text di luar) di antara marker:
${BEGIN}
{
  "suggestedName": "Nama host (3-4 kata, contoh: 'Salsa Sales Hangat')",
  "visualStyle": "Ringkas tag visual style untuk admin (mis: 'Female 24 hijab casual photoreal natural')",
  "promptImage": "Prompt lengkap untuk Gemini Nano Banana 2 (English, ~120-220 kata, ada negative prompt di akhir)",
  "promptVideo": "Prompt motion untuk Kling (English, ~30-60 kata, neutral terhadap art style)",
  "suggestedGreeting": "Greeting awal customer saat masuk live room (Bahasa Indonesia, 1-2 kalimat santai)"
}
${END}`
}

interface KlipLivePresetData {
  visualHookFragment: string
  visualHookStabilityHints: string[]
  backgroundFragment: string
  backgroundMotionHint: string
}

function buildUserPrompt(
  input: OrchestrateInput,
  productNames: string[],
  presets?: KlipLivePresetData,
): string {
  const productLine =
    productNames.length > 0
      ? `Produk yang ditampilkan host: ${productNames.join(', ')}. Tampilkan host memegang/menunjuk salah satu produk dengan natural.`
      : 'Tidak ada produk fisik di gambar — host posisi netral (tangan rileks di depan tubuh atau di samping).'

  // Klip Live: kalau backgroundFragment ada, override BACKGROUND_LABEL standar.
  const backgroundLine = presets?.backgroundFragment
    ? `Background (Klip Live preset — embed PERSIS di promptImage): ${presets.backgroundFragment}`
    : `Background: ${BACKGROUND_LABEL[input.background]}`

  // Visual hook section — append ke karakter kalau ada.
  const visualHookLine = presets?.visualHookFragment
    ? `\nVISUAL HOOK (Klip Live — daya tarik visual yang harus tampil di gambar):
${presets.visualHookFragment}
Stability constraints (penting untuk video lipsync):
${presets.visualHookStabilityHints.map((h) => `- ${h}`).join('\n')}`
    : ''

  const motionHintLine = presets?.backgroundMotionHint
    ? `\nBACKGROUND MOTION HINT (untuk promptVideo):
${presets.backgroundMotionHint}`
    : ''

  return `Generate host prompts dengan karakteristik:

ART STYLE (PENTING — embed dengan persis di promptImage termasuk negative prompts):
${ART_STYLE_LABEL[input.artStyle]}

KARAKTER:
- Gender: ${GENDER_LABEL[input.gender]}
- Age: ${AGE_LABEL[input.ageRange]}
- Outfit: ${OUTFIT_LABEL[input.outfit]}
- Expression/vibe: ${VIBE_LABEL[input.vibe]}
- ${backgroundLine}
${visualHookLine}

MOTION (untuk promptVideo, netral terhadap style):
${MOTION_INTENSITY_LABEL[input.motionIntensity]}
${motionHintLine}

PRODUK:
${productLine}
${input.extraNote ? `\nCatatan tambahan dari user: ${input.extraNote.slice(0, 300)}` : ''}

REMINDER (CRITICAL):
- Komposisi: WIDE-medium shot, host KECIL DI FRAME (head 12-18% frame height), negative space lega atas/bawah/kiri/kanan, vertical 9:16. JANGAN bikin close-up atau head-shot.
- POSE WAJIB SIMETRIS & FRONTAL — 100% menghadap kamera (0°), bahu paralel frame, kedua kaki paralel selebar bahu menapak rata, kedua tangan dalam posisi mirrored. DILARANG: 3/4 angle, side view, body twist, contrapposto, weight shift, hip pop, kaki silang/crossed, satu kaki maju, tangan asimetris. Alasan: loop Kling balik ke pose awal — kalau pose asimetris loop akan nyentak.
- Motion: kamera STATIC, SILENT video (no audio, no lip-sync, no speech, mulut tidak buka-tutup), host return to starting pose di akhir. Gerakan harus reversibel & simetris (kedua tangan bareng, jangan satu tangan ngangkat doang).
- Untuk art style "photoreal_natural" atau "photoreal_cinematic" atau "realistic_3d": WAJIB include negative prompt "NOT plastic doll skin, NOT smooth airbrushed, NOT AI-glossy, NOT uncanny valley, NOT mannequin, NOT retouched advertising perfect skin, NOT close-up, NOT head shot, NOT side angle, NOT crossed legs, NOT asymmetric stance".
- Untuk pixar_3d / anime_modern / painterly / ghibli: JANGAN campur dengan keyword photoreal — biarkan style murni stylized.
- suggestedName max 4 kata, gampang diingat.`
}

interface ParsedOutput {
  suggestedName: string
  visualStyle: string
  promptImage: string
  promptVideo: string
  suggestedGreeting: string
}

function parseOutput(raw: string): ParsedOutput {
  // Strategi: cari JSON dengan fallback multi-stage.
  // 1. Pakai markers BEGIN/END kalau ada.
  // 2. Strip code fence ```json ... ``` kalau ada.
  // 3. Cari JSON object pertama yang valid (curly braces match).
  let jsonText: string | null = null
  const begin = raw.indexOf(BEGIN)
  const end = raw.indexOf(END, begin)
  if (begin !== -1 && end !== -1) {
    jsonText = raw.slice(begin + BEGIN.length, end).trim()
  } else {
    // Coba strip code fence
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/i)
    if (fenceMatch) {
      jsonText = fenceMatch[1]?.trim() ?? null
    }
    if (!jsonText) {
      // Cari curly brace match terbesar
      const firstBrace = raw.indexOf('{')
      const lastBrace = raw.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        jsonText = raw.slice(firstBrace, lastBrace + 1).trim()
      }
    }
  }
  if (!jsonText) {
    throw new Error(
      `Output Claude tidak ada JSON valid (marker BEGIN/END atau code fence). Raw[:200]: ${raw.slice(0, 200)}`,
    )
  }
  let parsed: ParsedOutput
  try {
    parsed = JSON.parse(jsonText) as ParsedOutput
  } catch (e) {
    throw new Error(
      `JSON parse gagal: ${(e as Error).message}. JSON[:200]: ${jsonText.slice(0, 200)}`,
    )
  }
  if (
    !parsed.promptImage ||
    !parsed.promptVideo ||
    !parsed.suggestedName ||
    !parsed.visualStyle
  ) {
    throw new Error(
      `Output tidak lengkap. Punya: ${Object.keys(parsed).join(',')}`,
    )
  }
  return parsed
}

export async function orchestrateHostPrompt(
  input: OrchestrateInput,
): Promise<OrchestrateOutput> {
  // Resolve products → image URLs (max 14 ref images Gemini limit).
  const productNames: string[] = []
  const productImageUrls: string[] = []
  if (input.productIds && input.productIds.length > 0) {
    const products = await prisma.product.findMany({
      where: { id: { in: input.productIds }, userId: input.userId },
      select: { id: true, name: true, imageUrl: true, images: true },
    })
    // Preserve order
    const order = new Map(input.productIds.map((id, i) => [id, i]))
    products.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999))
    for (const p of products.slice(0, 14)) {
      productNames.push(p.name)
      const url = p.imageUrl ?? p.images[0]
      if (url) productImageUrls.push(url)
    }
  }

  // Sprint 5: load preset Klip Live fragments kalau ada
  let visualHookFragment = ''
  let visualHookStabilityHints: string[] = []
  let backgroundFragment = ''
  let backgroundMotionHint = ''
  if (input.visualHookPresetId) {
    const hook = await prisma.visualHookPreset.findUnique({
      where: { id: input.visualHookPresetId },
      select: { promptFragment: true, stabilityHints: true, nameId: true },
    })
    if (hook) {
      visualHookFragment = hook.promptFragment
      visualHookStabilityHints = hook.stabilityHints
    }
  }
  if (input.backgroundPresetId) {
    const bg = await prisma.backgroundPreset.findUnique({
      where: { id: input.backgroundPresetId },
      select: { promptFragment: true, motionHint: true, nameId: true },
    })
    if (bg) {
      backgroundFragment = bg.promptFragment
      backgroundMotionHint = bg.motionHint ?? ''
    }
  }

  const apiKey = await getLiveApiKey('ANTHROPIC')
  const client = new Anthropic({ apiKey })
  const systemPrompt = buildSystemPrompt(input.hostMode === 'NATIVE_LIBRARY')
  const userPrompt = buildUserPrompt(input, productNames, {
    visualHookFragment,
    visualHookStabilityHints,
    backgroundFragment,
    backgroundMotionHint,
  })
  const estimateInputTokens = Math.ceil(
    (systemPrompt.length + userPrompt.length) / 3.5,
  )

  const { result } = await executeAiWithCharge({
    featureKey: FEATURE_KEY,
    userId: input.userId,
    ctx: {
      referencePrefix: `host_orchestrate:${input.userId}:${Date.now()}`,
      description: `Host prompt orchestrate — ${input.gender}/${input.ageRange}/${input.outfit}`,
      subjectType: 'HOST_PROMPT_ORCHESTRATE',
      subjectId: undefined,
      estimateInputTokens,
      estimateOutputTokens: MAX_OUTPUT,
      aiCall: async () => {
        const res = await client.messages.create({
          model: MODEL,
          max_tokens: MAX_OUTPUT,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        })
        const text = res.content
          .filter(
            (b: Anthropic.ContentBlock): b is Anthropic.TextBlock => b.type === 'text',
          )
          .map((b) => b.text)
          .join('')
        return {
          result: text,
          inputTokens: res.usage.input_tokens,
          outputTokens: res.usage.output_tokens,
        }
      },
    },
  })

  const parsed = parseOutput(result)
  return {
    promptImage: parsed.promptImage.slice(0, 1900),
    promptVideo: parsed.promptVideo.slice(0, 900),
    suggestedName: parsed.suggestedName.slice(0, 120),
    visualStyle: parsed.visualStyle.slice(0, 200),
    suggestedGreeting: parsed.suggestedGreeting.slice(0, 500),
    productImageUrls,
  }
}
