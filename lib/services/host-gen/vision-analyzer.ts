// Vision analyzer — Claude 4.7 Vision analyze gambar host hasil Gemini,
// extract structured analysis untuk dipakai adaptive Kling prompt builder.
//
// Flow:
//   1. Read sourceImageUrl dari disk → base64 (image source untuk Anthropic).
//   2. Call Claude Vision dengan prompt instruksi struktur JSON output.
//   3. Parse JSON → ImageVisionAnalysis (lihat clip-types.ts).
//   4. Save ke HostTemplate.visionAnalysis JSON column + visionAnalyzedAt.
//
// Cost: ~$0.003-0.005 per analyze (Haiku 4.5 vision, ~1 image + ~1500 token output).
// Re-analyze WAJIB kalau owner regenerate sourceImageUrl.

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import Anthropic from '@anthropic-ai/sdk'

import { prisma } from '@/lib/prisma'
import { getLiveApiKey } from '@/lib/services/live/provider-keys'

import type { ImageVisionAnalysis } from './clip-types'

// Model Vision: pakai Haiku 4.5 (cepat + cukup akurat untuk scene description).
// Bisa upgrade ke Sonnet kalau hasil terlalu shallow.
const VISION_MODEL = 'claude-haiku-4-5'
const MAX_OUTPUT_TOKENS = 2_000

const SYSTEM_PROMPT = `You are an expert image analyst for an AI live-shopping host generator.
Your task: analyze a generated host image and output a STRICT JSON describing what's actually in the image, so a downstream system can craft accurate motion prompts for AI video generation (Kling lip-sync).

Output JSON only between markers BEGIN_JSON and END_JSON. No prose outside. The JSON MUST follow this exact schema:

{
  "hostPose": {
    "facing": "frontal" | "three-quarter" | "side",
    "posture": "symmetric" | "slight-lean" | "asymmetric",
    "shouldersLevel": boolean,
    "armsPosition": "sides" | "crossed" | "holding-product" | "gesture" | "on-hips" | "one-up",
    "handsCount": number (0-2 visible)
  },
  "visualHook": {
    "detected": [string array — accessories/costume yang terlihat: "topi koboy coklat", "rompi kulit hitam"],
    "stabilityConstraints": [string array — constraint untuk video gen biar elemen ini tetap stabil: "topi koboy brim must not shift or rotate", "rompi kulit must not flap"]
  },
  "background": {
    "type": string (description singkat: "gudang stok kardus tinggi industrial"),
    "motionElements": [
      {
        "element": string ("konveyor belt" | "plant leaves" | "assistant packing motion"),
        "motionDirection": string ("left-to-right continuous" | "gentle upward drift"),
        "intensity": "subtle" | "moderate" | "strong"
      }
    ],
    "staticElements": [string array — elemen yg HARUS tetap diam: "rak baja stable", "lampu industrial fixed"]
  },
  "products": [
    {
      "guessedName": string ("kotak putih kecil" — gak harus tau nama exact),
      "placement": string ("meja kayu di sebelah kanan host" | "di tangan kanan"),
      "visibility": "fully" | "partial" | "background-blur"
    }
  ],
  "mouthState": "closed-smile" | "slight-open" | "neutral" | "wide-smile",
  "composition": {
    "headPercentOfFrame": number (12-18 ideal untuk loop animation safety),
    "centered": boolean,
    "negativeSpaceOK": boolean
  },
  "qualityFlags": [string array — hint buat owner review: "bahu sedikit tilt 5deg", "kaki tidak terlihat", "lighting menyamping"],
  "rawDescription": string (1-2 kalimat deskripsi singkat keseluruhan scene)
}

CRITICAL RULES:
- backbone of analysis: deteksi elemen yang akan jadi CONSTRAINT atau MOTION TARGET di video gen.
- visualHook.stabilityConstraints harus actionable — kalimat imperatif "X must remain stable / X must not shift" yang bisa langsung di-feed ke Kling prompt.
- background.motionElements HANYA berisi elemen yang BISA dan SEBAIKNYA bergerak natural (e.g. konveyor belt yes, dinding no).
- background.staticElements = elemen yg HARUS diam (e.g. produk di meja).
- mouthState = base state — video gen akan animate dari sini ke lip-sync.
- JANGAN invent informasi yang tidak terlihat di gambar.
- Output JSON HARUS valid parse-able.`

function parseJsonBetweenMarkers(raw: string): unknown {
  const beginIdx = raw.indexOf('BEGIN_JSON')
  const endIdx = raw.indexOf('END_JSON')
  let jsonStr = raw
  if (beginIdx >= 0 && endIdx > beginIdx) {
    jsonStr = raw.slice(beginIdx + 'BEGIN_JSON'.length, endIdx).trim()
  }
  // Strip code fence kalau ada
  jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  return JSON.parse(jsonStr)
}

function resolveImagePath(sourceImageUrl: string): string {
  // sourceImageUrl format: "/uploads/host-images/<userId>/<filename>" (path web)
  // → translate ke filesystem absolute path
  if (sourceImageUrl.startsWith('http://') || sourceImageUrl.startsWith('https://')) {
    throw new Error('Vision analyze butuh local file path, dapat absolute URL — tidak didukung di MVP')
  }
  const rel = sourceImageUrl.startsWith('/') ? sourceImageUrl.slice(1) : sourceImageUrl
  return path.join(process.cwd(), 'public', rel)
}

function detectMediaType(filePath: string): 'image/png' | 'image/jpeg' | 'image/webp' {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  return 'image/png' // default
}

export interface VisionAnalyzeOptions {
  // Override featureKey untuk billing — Sprint 5 hooks media-charge di sini.
  // Untuk MVP Sprint 1.5, kosongkan = tidak charge.
  chargeFeatureKey?: string
  // Custom prompt addition kalau perlu (debug / experiment).
  extraInstructions?: string
}

export async function analyzeHostImage(
  hostTemplateId: string,
  options: VisionAnalyzeOptions = {},
): Promise<{ analysis: ImageVisionAnalysis; rawResponse: string }> {
  const host = await prisma.hostTemplate.findUnique({
    where: { id: hostTemplateId },
    select: { id: true, sourceImageUrl: true, userId: true },
  })
  // Sprint 5+: billing per call ~Rp 100 floor
  if (host?.userId) {
    try {
      const { computeMediaCharge } = await import('@/lib/services/media-charge')
      const { deductTokenAtomic } = await import('@/lib/services/ai-generation-log')
      const charge = await computeMediaCharge({ featureKey: 'KLIP_LIVE_VISION', units: 1500 })
      await deductTokenAtomic({
        userId: host.userId,
        tokensCharged: charge.tokensCharged,
        description: 'Klip Live Vision Analyzer',
        reference: `klip_vision:${hostTemplateId}`,
      })
    } catch (e) {
      console.warn('[vision-analyzer] billing skip:', (e as Error).message)
    }
  }
  if (!host) throw new Error('Host template tidak ditemukan')
  if (!host.sourceImageUrl) throw new Error('Host belum punya source image — generate dulu via Gemini')

  const absPath = resolveImagePath(host.sourceImageUrl)
  const buf = await readFile(absPath).catch((e) => {
    throw new Error(`Source image tidak bisa dibaca di ${absPath}: ${(e as Error).message}`)
  })
  const mediaType = detectMediaType(absPath)
  const base64 = buf.toString('base64')

  // Pakai key dari DB (pola sama dgn live/chat.ts) — bukan env var.
  const apiKey = await getLiveApiKey('ANTHROPIC')
  const client = new Anthropic({ apiKey })

  const userPromptText = options.extraInstructions
    ? `Analyze this host image and output the structured JSON per schema.\n\nExtra:\n${options.extraInstructions}`
    : 'Analyze this host image and output the structured JSON per schema.'

  const res = await client.messages.create({
    model: VISION_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          { type: 'text', text: userPromptText },
        ],
      },
    ],
  })

  const rawResponse = res.content
    .filter((b: Anthropic.ContentBlock): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()

  let parsed: unknown
  try {
    parsed = parseJsonBetweenMarkers(rawResponse)
  } catch (e) {
    throw new Error(
      `Vision response bukan JSON valid: ${(e as Error).message}. Raw (200ch): ${rawResponse.slice(0, 200)}`,
    )
  }

  const analysis = parsed as ImageVisionAnalysis
  // Validasi minimum — pastikan field critical ada.
  if (!analysis.hostPose || !analysis.visualHook || !analysis.background) {
    throw new Error('Vision JSON kurang field kritis (hostPose/visualHook/background)')
  }

  // Persist ke DB
  await prisma.hostTemplate.update({
    where: { id: hostTemplateId },
    data: {
      // @ts-expect-error — JSON column accepts any structured object.
      visionAnalysis: analysis,
      visionAnalyzedAt: new Date(),
    },
  })

  return { analysis, rawResponse }
}
