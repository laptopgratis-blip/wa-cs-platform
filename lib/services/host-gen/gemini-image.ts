// Gemini Nano Banana 2 — image generation (sync) untuk avatar host CS Live AI.
// Pakai REST API langsung (bukan SDK) supaya tidak bergantung versi SDK
// @google/generative-ai (image-gen API masih early access di sebagian versi).
//
// Endpoint: POST .../models/{model}:generateContent?key={KEY}
// Multi-modal input: bisa terima sampai 14 inline_data referensi (sesuai
// Nano Banana 2 spec) — dipakai untuk konsistensi produk/karakter.
import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { getHostGenApiKey } from './provider-keys'

const GEMINI_HOST = 'https://generativelanguage.googleapis.com'
const DEFAULT_MODEL = 'gemini-3.1-flash-image-preview'

interface GeminiInlineData {
  inlineData?: { mimeType: string; data: string }
  inline_data?: { mime_type: string; data: string }
  text?: string
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiInlineData[] }
    finishReason?: string
  }>
  promptFeedback?: { blockReason?: string }
  error?: { message?: string; status?: string; code?: number }
}

export interface GeminiImageInput {
  prompt: string
  // Referensi gambar (foto produk, mood, logo). Maks 14 per call.
  referenceImages?: Array<{ mimeType: string; base64: string }>
  model?: string
}

export interface GeminiImageResult {
  imagePath: string // path lokal `/uploads/host-images/...`
  imageBytes: number
  modelName: string
  finishReason?: string
}

const HOST_IMAGES_DIR_REL = path.join('public', 'uploads', 'host-images')

// Generate gambar + langsung simpan ke `public/uploads/host-images/<userId>/<id>.png`.
// Return path public-relative supaya bisa langsung dipakai sebagai <img src>.
export async function generateHostImage(input: {
  userId: string
  prompt: string
  referenceImages?: GeminiImageInput['referenceImages']
  model?: string
}): Promise<GeminiImageResult> {
  const apiKey = await getHostGenApiKey('GOOGLE')
  const model = input.model ?? DEFAULT_MODEL
  const url = `${GEMINI_HOST}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`

  // Build parts: text prompt + (optional) inline_data refs.
  const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [
    { text: input.prompt },
  ]
  for (const ref of input.referenceImages ?? []) {
    parts.push({
      inline_data: { mime_type: ref.mimeType, data: ref.base64 },
    })
  }
  if (parts.length > 15) {
    throw new Error('Maks 14 gambar referensi per call.')
  }

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['IMAGE'],
    },
  }

  // Retry 2x dengan exponential backoff — Node 22 fetch occasionally hangs/fails
  // untuk Google Cloud endpoints (sama issue dengan ElevenLabs). Wrap try/catch
  // supaya error message lebih informatif daripada generic "fetch failed".
  let res: Response | null = null
  let lastErr: Error | null = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      })
      break
    } catch (e) {
      const err = e as Error & { cause?: { code?: string } }
      lastErr = err
      const causeCode = err.cause?.code ?? ''
      // Retry only on network errors, not abort/timeout
      if (causeCode === 'ETIMEDOUT' || causeCode === 'ECONNRESET' || causeCode === 'UND_ERR_SOCKET') {
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 1500 * attempt))
          continue
        }
      }
      throw new Error(`Gemini fetch gagal (attempt ${attempt}): ${err.name}: ${err.message}${causeCode ? ` [${causeCode}]` : ''}`)
    }
  }
  if (!res) {
    throw new Error(`Gemini fetch gagal setelah 3 attempt: ${lastErr?.message ?? 'unknown'}`)
  }
  const text = await res.text()
  let json: GeminiResponse
  try {
    json = JSON.parse(text) as GeminiResponse
  } catch {
    throw new Error(
      `Gemini response bukan JSON (HTTP ${res.status}): ${text.slice(0, 300)}`,
    )
  }
  if (!res.ok || json.error) {
    const msg = json.error?.message ?? `HTTP ${res.status}`
    throw new Error(`Gemini error: ${msg}`)
  }
  if (json.promptFeedback?.blockReason) {
    throw new Error(
      `Prompt diblok Gemini safety: ${json.promptFeedback.blockReason}`,
    )
  }

  const candidate = json.candidates?.[0]
  const parts2 = candidate?.content?.parts ?? []
  const imagePart = parts2.find(
    (p) => p.inlineData?.data ?? p.inline_data?.data,
  )
  const inline = imagePart?.inlineData ?? imagePart?.inline_data
  if (!inline?.data) {
    throw new Error(
      `Gemini tidak return gambar. Finish: ${candidate?.finishReason ?? 'unknown'}.`,
    )
  }

  const buf = Buffer.from(inline.data, 'base64')
  const ext = inferExt(
    ('mimeType' in inline ? inline.mimeType : inline.mime_type) ?? 'image/png',
  )
  const filename = `${randomBytes(12).toString('hex')}.${ext}`
  const dir = path.join(process.cwd(), HOST_IMAGES_DIR_REL, input.userId)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, filename), buf)

  return {
    imagePath: `/uploads/host-images/${input.userId}/${filename}`,
    imageBytes: buf.length,
    modelName: model,
    finishReason: candidate?.finishReason,
  }
}

function inferExt(mime: string): string {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
  if (mime.includes('webp')) return 'webp'
  return 'png'
}

// Util: ubah path public-relative jadi base64 (untuk dipakai sebagai
// referenceImage di call berikutnya).
export async function fileToBase64(filePath: string): Promise<{
  mimeType: string
  base64: string
}> {
  const abs = filePath.startsWith('/')
    ? path.join(process.cwd(), 'public', filePath.slice(1))
    : filePath
  const { readFile } = await import('node:fs/promises')
  const buf = await readFile(abs)
  const ext = path.extname(abs).toLowerCase().slice(1)
  const mimeType =
    ext === 'jpg' || ext === 'jpeg'
      ? 'image/jpeg'
      : ext === 'webp'
        ? 'image/webp'
        : 'image/png'
  return { mimeType, base64: buf.toString('base64') }
}
