// Live room TTS — OpenAI tts-1. Cache di public/uploads/live-tts/ by hash
// (text + voice + model) supaya call ulang gratis.
//
// Pattern di-copy dari siska-ai/routes/tts.js (proven di event live).
// Format output: MP3 64 kbps mono — cukup untuk live shopping mobile.
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { getLiveApiKey } from './provider-keys'

const TTS_DIR_REL = path.join('public', 'uploads', 'live-tts')
const TTS_URL_PREFIX = '/uploads/live-tts'

// gpt-4o-mini-tts = generasi baru OpenAI TTS (2025+). Project umumnya
// punya akses default tanpa harus enable spesifik tts-1 lama. Output mp3 sama.
const DEFAULT_MODEL = 'gpt-4o-mini-tts'
const DEFAULT_VOICE = 'nova' // friendly female (default Hulao live shopping)
const DEFAULT_SPEED = 1.0

// Default instructions kalau room tidak set ttsInstructions sendiri.
// Critical untuk hasil yang gak robotic — gpt-4o-mini-tts mendukung
// natural-language style guidance.
const DEFAULT_INSTRUCTIONS = `Speak in a warm, friendly Indonesian woman tone — natural conversational pace, slightly enthusiastic when mentioning products or benefits. Sound like a friendly live shopping host, not a robot. Use natural intonation variations: slightly higher pitch on questions, softer on reassurances. Light hint of Jakartan accent OK. Do not over-pronounce — speak casually as if chatting with a friend.`

// OpenAI tts-1 voices yg supported (per 2026).
export const TTS_VOICES = [
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'onyx',
  'nova',
  'sage',
  'shimmer',
  'verse',
] as const
export type TtsVoice = (typeof TTS_VOICES)[number]

function cacheKey(input: {
  text: string
  voice: string
  speed: number
  model: string
  instructions: string
}): string {
  return createHash('sha1')
    .update(
      `${input.model}|${input.voice}|${input.speed}|${input.instructions}|${input.text}`,
    )
    .digest('hex')
}

export interface TtsInput {
  text: string
  voice?: string
  speed?: number
  model?: string
  // gpt-4o-mini-tts mendukung field `instructions` — guide nada/emosi/tempo
  // via natural language. Kalau diisi langsung, override compose otomatis.
  instructions?: string
  // Slider-derived knobs (di-compose ke instructions kalau `instructions` kosong).
  pitchOffset?: number // -1.0..1.0 (lower / higher pitch)
  expressiveness?: number // 0..1 (flat / very expressive)
  // Charge ke userId (room owner). Cache HIT tidak charge. Required untuk
  // audit — kalau gak provide, skip charge (legacy/admin debug).
  userId?: string
  subjectType?: string
  subjectId?: string
}

// Compose natural-language instructions dari slider knobs. Dipakai kalau
// owner tidak set ttsInstructions custom.
export function composeTtsInstructions(opts: {
  pitchOffset: number
  expressiveness: number
  userOverride?: string | null
}): string {
  if (opts.userOverride && opts.userOverride.trim().length > 0) {
    return opts.userOverride.trim()
  }
  const parts: string[] = [
    'Speak in a warm friendly Indonesian woman tone — natural conversational pace, like a live shopping host chatting with friends.',
  ]
  // Pitch
  if (opts.pitchOffset <= -0.5) {
    parts.push('Use a noticeably deeper, lower-pitched voice — calm and grounded.')
  } else if (opts.pitchOffset < -0.15) {
    parts.push('Use a slightly lower-pitched voice — warm and steady.')
  } else if (opts.pitchOffset >= 0.5) {
    parts.push('Use a noticeably higher-pitched voice — bright, youthful, energetic.')
  } else if (opts.pitchOffset > 0.15) {
    parts.push('Use a slightly higher-pitched voice — bright and friendly.')
  }
  // Expressiveness
  if (opts.expressiveness <= 0.2) {
    parts.push(
      'Keep intonation flat and minimal — calm and controlled, almost monotone.',
    )
  } else if (opts.expressiveness < 0.45) {
    parts.push('Use subtle intonation, mostly controlled with light emphasis on key words.')
  } else if (opts.expressiveness >= 0.8) {
    parts.push(
      'Use HIGHLY expressive intonation — varied pitch, strong emphasis on benefits and product names, smile-in-voice, dynamic excitement.',
    )
  } else if (opts.expressiveness >= 0.6) {
    parts.push(
      'Use lively expressive intonation with clear pitch variation and emphasis on important words.',
    )
  } else {
    parts.push('Use natural conversational intonation with subtle emphasis on key words.')
  }
  return parts.join(' ')
}

export interface TtsResult {
  url: string // public-relative
  cached: boolean
}

// Generate (atau ambil dari cache) audio MP3 untuk 1 kalimat. Return URL
// public yang langsung di-pakai di <audio src> client.
export async function generateLiveTts(input: TtsInput): Promise<TtsResult> {
  const text = input.text.trim()
  if (!text) throw new Error('TTS text kosong')

  const voice = input.voice ?? DEFAULT_VOICE
  const speed = Math.max(0.25, Math.min(4, input.speed ?? DEFAULT_SPEED))
  const model = input.model ?? DEFAULT_MODEL
  // Compose instructions kalau user gak kasih override eksplisit.
  const instructions = input.instructions?.trim()
    ? input.instructions.trim()
    : composeTtsInstructions({
        pitchOffset: input.pitchOffset ?? 0,
        expressiveness: input.expressiveness ?? 0.5,
      })
  const hash = cacheKey({ text, voice, speed, model, instructions })
  const filename = `${hash}.mp3`
  const abs = path.join(process.cwd(), TTS_DIR_REL, filename)
  const url = `${TTS_URL_PREFIX}/${filename}`

  // Cache hit — file sudah ada di disk. TIDAK charge ulang (provider cost
  // sudah dibayar dulu, sekarang gratis re-use).
  if (existsSync(abs)) {
    return { url, cached: true }
  }

  // Import dinamis biar gak circular dep + cuma load saat MISS.
  const { chargeUsage } = await import('@/lib/services/usage-charge')

  const apiKey = await getLiveApiKey('OPENAI')
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      voice,
      input: text,
      speed,
      instructions,
      response_format: 'mp3',
    }),
  })
  if (!res.ok) {
    const raw = await res.text().catch(() => '')
    throw new Error(`OpenAI TTS gagal HTTP ${res.status}: ${raw.slice(0, 200)}`)
  }
  const arrayBuf = await res.arrayBuffer()
  const buf = Buffer.from(arrayBuf)

  await mkdir(path.dirname(abs), { recursive: true })
  await writeFile(abs, buf)

  // Charge per character text input. Cache miss = call asli ke OpenAI.
  if (input.userId) {
    await chargeUsage({
      userId: input.userId,
      featureKey: 'LIVE_TTS_OPENAI',
      units: text.length,
      reference: `tts_${input.subjectId ?? hash.slice(0, 12)}`,
      description: `TTS realtime ${text.length} char`,
      subjectType: input.subjectType ?? 'LIVE_TTS',
      subjectId: input.subjectId,
    })
  }

  return { url, cached: false }
}

// Generate TTS untuk banyak kalimat paralel. Return URL array sesuai urutan.
export async function generateLiveTtsBatch(input: {
  sentences: string[]
  voice?: string
  speed?: number
  model?: string
  instructions?: string
  pitchOffset?: number
  expressiveness?: number
  // Charge ke room owner. Per-kalimat charge per char (sequential, anti-race).
  userId?: string
  subjectType?: string
  subjectId?: string
}): Promise<TtsResult[]> {
  return Promise.all(
    input.sentences.map((text) =>
      generateLiveTts({
        text,
        voice: input.voice,
        speed: input.speed,
        model: input.model,
        instructions: input.instructions,
        pitchOffset: input.pitchOffset,
        expressiveness: input.expressiveness,
        userId: input.userId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
      }),
    ),
  )
}
