// Whisper service — transcribe audio dari uploaded MP4 untuk admin clip upload.
//
// Endpoint: POST https://api.openai.com/v1/audio/transcriptions
// Model: whisper-1 (cheap, ~$0.006/menit audio, akurasi Indonesian bagus)
//
// Output: text transcript + language detected. Disimpan ke LiveClip.transcript
// supaya matching layer (Sprint 4) bisa embed.
//
// Untuk video MP4: kita extract audio dulu? Actually Whisper API accepts video
// formats langsung (mp4, mov, mpeg) — internal extract audio. Cuma kalau file
// terlalu besar (>25MB), perlu split. Untuk klip <30dtk, biasanya <5MB OK.

import { randomUUID } from 'node:crypto'
import { Buffer } from 'node:buffer'

import { getLiveApiKey } from '@/lib/services/live/provider-keys'
import {
  deductTokenAtomic,
  logGeneration,
} from '@/lib/services/ai-generation-log'
import { computeMediaCharge } from '@/lib/services/media-charge'

interface WhisperResult {
  text: string
  language?: string
  durationSec?: number
}

const MAX_FILE_BYTES = 25 * 1024 * 1024 // OpenAI limit
const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions'

export async function transcribeAudio(
  fileBuffer: Buffer,
  filename: string,
  options: {
    language?: string
    // Charge ke userId — REQUIRED untuk audit. Kalau gak provide, throw.
    userId?: string
    // Subject untuk audit log (e.g., 'CLIP', '<clipId>').
    subjectType?: string
    subjectId?: string
  } = {},
): Promise<WhisperResult> {
  if (fileBuffer.length > MAX_FILE_BYTES) {
    throw new Error(
      `File terlalu besar untuk Whisper (${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB > 25MB). Split dulu.`,
    )
  }
  const apiKey = await getLiveApiKey('OPENAI')

  // Build multipart manually — File API + FormData di Node 22 OK untuk fetch.
  const form = new FormData()
  // Web Blob untuk multipart body.
  const blob = new Blob([new Uint8Array(fileBuffer)])
  form.append('file', blob, filename)
  form.append('model', 'whisper-1')
  form.append('response_format', 'verbose_json')
  if (options.language) {
    form.append('language', options.language)
  } else {
    // Default Indonesian — paling sering dipake Hulao owner.
    form.append('language', 'id')
  }

  const res = await fetch(WHISPER_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`Whisper transcribe gagal HTTP ${res.status}: ${errBody.slice(0, 300)}`)
  }
  const json = (await res.json()) as {
    text?: string
    language?: string
    duration?: number
  }
  if (!json.text) {
    throw new Error('Whisper return tanpa text')
  }

  // Charge cost berdasarkan durasi audio aktual (Whisper kasih duration).
  // Kalau caller gak pass userId, skip charge (legacy / admin debug only).
  // Defensive: kalau gak ada duration di response, estimasi dari ukuran file.
  const durationSec =
    json.duration ?? Math.max(1, fileBuffer.length / 16_000) // ~16kB/sec MP3 estimate fallback

  // Pattern standar Hulao: computeMediaCharge → deductTokenAtomic → logGeneration.
  // Caller wajib pass userId untuk audit; kalau gak pass, skip (legacy compat).
  if (options.userId) {
    const charge = await computeMediaCharge({
      featureKey: 'WHISPER_TRANSCRIBE_OPENAI',
      units: Math.ceil(durationSec),
    })
    const ded = await deductTokenAtomic({
      userId: options.userId,
      tokensCharged: charge.tokensCharged,
      description: `Whisper transcribe ${Math.ceil(durationSec)}dtk`,
      reference: `whisper:${options.subjectId ?? randomUUID()}`,
    })
    await logGeneration({
      featureKey: 'WHISPER_TRANSCRIBE_OPENAI',
      userId: options.userId,
      subjectType: options.subjectType ?? 'WHISPER',
      subjectId: options.subjectId,
      charge,
      status: ded.ok ? 'OK' : 'INSUFFICIENT_BALANCE',
      errorMessage: ded.ok ? undefined : 'Saldo kurang setelah Whisper call',
    })
  }

  return {
    text: json.text.trim(),
    language: json.language,
    durationSec,
  }
}
