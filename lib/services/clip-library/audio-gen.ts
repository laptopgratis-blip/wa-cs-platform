// ElevenLabs TTS client untuk Klip Live mode.
//
// Endpoint: POST /v1/text-to-speech/{voice_id}
// Returns: MP3 binary stream
// Auth: xi-api-key header (key dari DB via getLiveApiKey extended)
//
// Output: save MP3 ke /public/uploads/clips-audio/<clip-id>.mp3 → return URL relative.
// Duration estimated from char count × MS_PER_CHAR (Indonesian TTS pace).
//
// IMPORTANT: pakai node:https (bukan fetch) sesuai issue Node 22 + ElevenLabs.

import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { decrypt } from '@/lib/crypto'
import { prisma } from '@/lib/prisma'

import type { AudioGenRequest, AudioGenResult } from '../host-gen/clip-types'

const CLIPS_AUDIO_DIR = path.join(process.cwd(), 'public', 'uploads', 'clips-audio')
const CLIPS_AUDIO_URL_PREFIX = '/uploads/clips-audio'

// Pace estimasi untuk Indonesian TTS (eleven_multilingual_v2 calibrated 2026-06-02
// dengan testing: "Halo kak welcome ke live Cleanoz..." 88 char → audio ~6.3dtk).
// Average ~14 char/dtk = 72 ms/char. Padding 400ms (silence awal + akhir).
const MS_PER_CHAR = 72
const AUDIO_PADDING_MS = 400

// Maksimum jumlah karakter aman untuk durasi video baseline tertentu.
// Formula: (baselineDurationMs - paddingMs) / MS_PER_CHAR - SAFETY_BUFFER_CHARS
// SAFETY_BUFFER_CHARS = 4 (per user request — kurangi 4 char ekstra dari teori).
const SAFETY_BUFFER_CHARS = 4
export function maxSafeCharsForDuration(baselineDurationMs: number): number {
  return Math.max(
    10,
    Math.floor((baselineDurationMs - AUDIO_PADDING_MS) / MS_PER_CHAR) - SAFETY_BUFFER_CHARS,
  )
}

// Model ElevenLabs default. Multilingual v2 = bagus untuk Indonesian.
// Alternatif: eleven_turbo_v2_5 (lebih cepat tapi single-lang), eleven_v3 (terbaru, beta).
const DEFAULT_MODEL = 'eleven_multilingual_v2'

// Voice default — Cahaya, female young Indonesian native (professional voice).
// Voice English (Sarah/Bella/dll) terdengar robotic accent saat bicara ID.
// Owner bisa override per host template (HostTemplate.voiceId).
const DEFAULT_VOICE_ID = 'iWydkXKoiVtvdn4vLKp9' // Cahaya - ID native

// Voice settings default — natural conversational tone.
const DEFAULT_VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.3,
  use_speaker_boost: true,
}

interface ElevenLabsKey {
  apiKey: string
}

const keyCache: { key: string | null; cachedAt: number } = { key: null, cachedAt: 0 }
const KEY_TTL_MS = 60_000

async function getElevenLabsKey(): Promise<string> {
  if (keyCache.key && Date.now() - keyCache.cachedAt < KEY_TTL_MS) {
    return keyCache.key
  }
  const row = await prisma.apiKey.findUnique({ where: { provider: 'ELEVENLABS' } })
  if (!row) {
    throw new Error('API key ELEVENLABS belum di-set. Owner harus isi di /admin/api-keys.')
  }
  if (!row.isActive) {
    throw new Error('API key ELEVENLABS non-aktif.')
  }
  const key = decrypt(row.apiKey).trim()
  keyCache.key = key
  keyCache.cachedAt = Date.now()
  return key
}

export function estimateDurationMs(text: string): number {
  const charCount = text.length
  return Math.max(1500, Math.round(charCount * MS_PER_CHAR + AUDIO_PADDING_MS))
}

// Generate TTS via ElevenLabs → MP3 file di disk → return URL relative.
// clipIdHint = LiveClip.id untuk filename consistency (kalau caller punya);
// otherwise random.
export async function generateClipAudio(
  request: AudioGenRequest & { clipIdHint?: string },
): Promise<AudioGenResult> {
  const text = request.text.trim()
  if (!text) throw new Error('Text kosong')
  if (text.length > 2500) {
    throw new Error('Script terlalu panjang (max 2500 char per klip)')
  }

  const apiKey = await getElevenLabsKey()
  const voiceId = (request.voiceId || DEFAULT_VOICE_ID).trim()
  const modelId = request.modelId || DEFAULT_MODEL

  const body = JSON.stringify({
    text,
    model_id: modelId,
    voice_settings: DEFAULT_VOICE_SETTINGS,
  })

  const mp3Buffer = await new Promise<Buffer>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const https = require('node:https') as typeof import('node:https')
    const req = https.request(
      {
        hostname: 'api.elevenlabs.io',
        port: 443,
        path: `/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
        method: 'POST',
        family: 4,
        headers: {
          'xi-api-key': apiKey,
          'content-type': 'application/json',
          accept: 'audio/mpeg',
          'content-length': Buffer.byteLength(body),
        },
        timeout: 60_000,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const buf = Buffer.concat(chunks)
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(buf)
          } else {
            const errBody = buf.toString('utf8').slice(0, 400)
            reject(
              new Error(
                `ElevenLabs TTS gagal HTTP ${res.statusCode}: ${errBody}`,
              ),
            )
          }
        })
        res.on('error', (e) => reject(e))
      },
    )
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('ElevenLabs TTS timeout (60s)'))
    })
    req.on('error', (e) => reject(e))
    req.write(body)
    req.end()
  })

  if (mp3Buffer.length === 0) {
    throw new Error('ElevenLabs TTS return empty MP3 buffer')
  }

  await mkdir(CLIPS_AUDIO_DIR, { recursive: true })
  const filename = `${request.clipIdHint || randomBytes(12).toString('hex')}.mp3`
  const absPath = path.join(CLIPS_AUDIO_DIR, filename)
  await writeFile(absPath, mp3Buffer)

  return {
    audioUrl: `${CLIPS_AUDIO_URL_PREFIX}/${filename}`,
    durationMs: estimateDurationMs(text),
    characterCount: text.length,
  }
}

// List voices yang owner sudah punya akses (premade + cloned).
// Hasil dipakai wizard untuk dropdown voice selection.
export async function listElevenLabsVoices(): Promise<
  Array<{
    voice_id: string
    name: string
    category: 'premade' | 'cloned' | 'professional' | string
    labels?: Record<string, string>
    preview_url?: string
  }>
> {
  const apiKey = await getElevenLabsKey()
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const https = require('node:https') as typeof import('node:https')
    const req = https.request(
      {
        hostname: 'api.elevenlabs.io',
        port: 443,
        path: '/v1/voices',
        method: 'GET',
        family: 4,
        headers: { 'xi-api-key': apiKey, accept: 'application/json' },
        timeout: 15_000,
      },
      (res) => {
        let body = ''
        res.on('data', (c: Buffer) => {
          body += c.toString('utf8')
        })
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const json = JSON.parse(body) as {
                voices?: Array<{
                  voice_id: string
                  name: string
                  category: string
                  labels?: Record<string, string>
                  preview_url?: string
                }>
              }
              resolve(json.voices ?? [])
            } catch (e) {
              reject(new Error(`Voices response invalid JSON: ${(e as Error).message}`))
            }
          } else {
            reject(new Error(`ElevenLabs voices gagal HTTP ${res.statusCode}: ${body.slice(0, 200)}`))
          }
        })
      },
    )
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('ElevenLabs voices timeout'))
    })
    req.on('error', (e) => reject(e))
    req.end()
  })
}
