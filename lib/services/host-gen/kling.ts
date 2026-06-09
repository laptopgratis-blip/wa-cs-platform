// Kling AI image-to-video — official API api.klingai.com (JWT auth).
// User punya 2 key dari platform.klingai.com: AccessKey + SecretKey.
// Disimpan di DB sebagai `<access>:<secret>` colon-separated lalu di-split
// di sini. JWT di-sign per call (TTL 30 menit).
//
// Endpoints:
//   POST   https://api.klingai.com/v1/videos/image2video    (submit)
//   GET    https://api.klingai.com/v1/videos/image2video/{task_id}  (poll + result)
//
// Output: task_result.videos[].url valid ~30hari (jauh lebih panjang dari Fal),
// tapi kita tetap download segera ke local supaya cepat dipakai live room.

import { createHmac, randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { getHostGenApiKey } from './provider-keys'
import { transcodeVideoToWeb } from '../media/transcode'

const KLING_HOST = 'https://api.klingai.com'

// Kling models tersedia:
//   - kling-v1 (legacy, murah)
//   - kling-v1-6 (mid)
//   - kling-v2-master (latest, best quality) — DEFAULT
// Modes: std (standard, cheaper) | pro (high quality, dipakai)
export const DEFAULT_KLING_MODEL = 'kling-v2-master'

export interface KlingSubmitInput {
  imageUrl: string // absolute URL (Kling fetch dari server-nya)
  prompt: string
  duration?: 5 | 10
  model?: string
  mode?: 'std' | 'pro'
}

export interface KlingSubmitResult {
  requestId: string // Kling task_id
  model: string
}

// Base64URL encode tanpa padding.
function b64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

// Sign JWT HS256 manual (no jsonwebtoken dependency). Sesuai spec:
// iss = AccessKey, exp = now+1800 sec, nbf = now-5 sec.
function signKlingJwt(accessKey: string, secretKey: string): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = { iss: accessKey, exp: now + 1800, nbf: now - 5 }
  const h = b64url(Buffer.from(JSON.stringify(header)))
  const p = b64url(Buffer.from(JSON.stringify(payload)))
  const data = `${h}.${p}`
  const sig = b64url(createHmac('sha256', secretKey).update(data).digest())
  return `${data}.${sig}`
}

// Ambil pair access_key + secret_key dari ApiKey table. Format disimpan:
//   `<access_key>:<secret_key>`. Kalau tidak ada colon, lempar error
//   (user belum migrasi dari Fal.ai format).
async function getKlingCredentials(): Promise<{
  accessKey: string
  secretKey: string
}> {
  const raw = await getHostGenApiKey('KLING')
  const idx = raw.indexOf(':')
  if (idx <= 0 || idx >= raw.length - 1) {
    throw new Error(
      'API key KLING harus format "AccessKey:SecretKey". Dapat dari platform.klingai.com (Developer → API Keys).',
    )
  }
  return {
    accessKey: raw.slice(0, idx).trim(),
    secretKey: raw.slice(idx + 1).trim(),
  }
}

export async function buildKlingAuthHeader(): Promise<string> {
  const { accessKey, secretKey } = await getKlingCredentials()
  return `Bearer ${signKlingJwt(accessKey, secretKey)}`
}

// Resolve image untuk Kling. Kalau URL absolute http(s) ke public host →
// send URL langsung. Kalau localhost / private IP / path lokal → baca file
// + send base64 (tanpa data-URI prefix, sesuai spec Kling).
async function resolveImageForKling(
  imageUrl: string,
): Promise<string> {
  // Path lokal (mulai dengan /uploads/) — pasti perlu base64.
  if (imageUrl.startsWith('/uploads/')) {
    const abs = path.join(process.cwd(), 'public', imageUrl.slice(1))
    const buf = await readFile(abs)
    return buf.toString('base64')
  }
  // Absolute URL ke localhost / private IP → fetch + base64.
  // (Kling server di luar tidak bisa fetch ke localhost user.)
  if (/^https?:\/\/(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(imageUrl)) {
    const res = await fetch(imageUrl)
    if (!res.ok) {
      throw new Error(`Fetch local image gagal HTTP ${res.status}: ${imageUrl}`)
    }
    const arrayBuf = await res.arrayBuffer()
    return Buffer.from(arrayBuf).toString('base64')
  }
  // Public URL → langsung dipakai Kling.
  return imageUrl
}

export async function submitKlingVideo(
  input: KlingSubmitInput,
): Promise<KlingSubmitResult> {
  const auth = await buildKlingAuthHeader()
  const model = input.model ?? DEFAULT_KLING_MODEL
  const mode = input.mode ?? 'std'
  const image = await resolveImageForKling(input.imageUrl)

  const body = {
    model_name: model,
    mode,
    image,
    prompt: input.prompt,
    duration: String(input.duration ?? 5),
    cfg_scale: 0.5,
  }

  const res = await fetch(`${KLING_HOST}/v1/videos/image2video`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: auth,
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Kling submit gagal HTTP ${res.status}: ${text.slice(0, 400)}`)
  }
  let json: {
    code?: number
    message?: string
    data?: { task_id?: string; task_status?: string }
  }
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Kling response bukan JSON: ${text.slice(0, 200)}`)
  }
  if (json.code !== 0 || !json.data?.task_id) {
    throw new Error(
      `Kling error code=${json.code} msg=${json.message ?? '?'}: ${text.slice(0, 200)}`,
    )
  }
  return { requestId: json.data.task_id, model }
}

export type KlingStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'

export interface KlingStatusResult {
  status: KlingStatus
  rawError?: string
}

// Poll status. Sekaligus pull result kalau succeed → caller bisa langsung
// download tanpa call kedua. Beda dgn Fal.ai yang pisah status vs response.
export interface KlingPollResult {
  status: KlingStatus
  videoUrl?: string
  videoId?: string // videos[0].id — beda dari task_id, ini buat lipsync video_id
  durationSeconds?: number
  rawError?: string
}

export async function pollKlingStatus(input: {
  requestId: string
  model?: string
}): Promise<KlingPollResult> {
  const auth = await buildKlingAuthHeader()
  const url = `${KLING_HOST}/v1/videos/image2video/${encodeURIComponent(input.requestId)}`

  const res = await fetch(url, {
    method: 'GET',
    headers: { authorization: auth },
  })
  const text = await res.text()
  if (!res.ok) {
    return { status: 'FAILED', rawError: `HTTP ${res.status}: ${text.slice(0, 300)}` }
  }
  let json: {
    code?: number
    message?: string
    data?: {
      task_status?: string
      task_status_msg?: string
      task_result?: {
        videos?: Array<{ id?: string; url?: string; duration?: string | number }>
      }
    }
  }
  try {
    json = JSON.parse(text)
  } catch {
    return { status: 'FAILED', rawError: `Non-JSON: ${text.slice(0, 200)}` }
  }
  if (json.code !== 0) {
    return {
      status: 'FAILED',
      rawError: `code=${json.code} ${json.message ?? ''}`,
    }
  }
  const s = (json.data?.task_status ?? '').toLowerCase()
  if (s === 'submitted') return { status: 'IN_QUEUE' }
  if (s === 'processing') return { status: 'IN_PROGRESS' }
  if (s === 'failed') {
    return {
      status: 'FAILED',
      rawError: json.data?.task_status_msg ?? 'Kling task failed',
    }
  }
  if (s === 'succeed' || s === 'succeeded') {
    const vid = json.data?.task_result?.videos?.[0]
    if (!vid?.url) {
      return { status: 'FAILED', rawError: 'succeed tapi videos.url kosong' }
    }
    return {
      status: 'COMPLETED',
      videoUrl: vid.url,
      videoId: vid.id, // CRITICAL untuk lipsync — beda dari task_id
      durationSeconds:
        typeof vid.duration === 'string' ? parseFloat(vid.duration) : (vid.duration ?? 0),
    }
  }
  // Unknown status — treat as in_progress.
  return { status: 'IN_PROGRESS' }
}

// Backward-compat alias: queue.ts dulu pakai fetchKlingResult terpisah. Sekarang
// pollKlingStatus already returns videoUrl ketika COMPLETED.
export async function fetchKlingResult(input: {
  requestId: string
  model?: string
}): Promise<{ videoUrl: string; durationSeconds: number; rawResponse: unknown }> {
  const r = await pollKlingStatus(input)
  if (r.status !== 'COMPLETED' || !r.videoUrl) {
    throw new Error(`Kling not completed yet: status=${r.status} ${r.rawError ?? ''}`)
  }
  return {
    videoUrl: r.videoUrl,
    durationSeconds: r.durationSeconds ?? 0,
    rawResponse: r,
  }
}

// Download MP4 dari URL ke public/uploads/host-videos/<userId>/<id>.mp4.
export async function downloadKlingVideo(input: {
  userId: string
  videoUrl: string
}): Promise<{ videoPath: string; bytes: number }> {
  const res = await fetch(input.videoUrl)
  if (!res.ok) {
    throw new Error(`Download Kling MP4 gagal HTTP ${res.status}`)
  }
  const arrayBuf = await res.arrayBuffer()
  const buf = Buffer.from(arrayBuf)
  const filename = `${randomBytes(12).toString('hex')}.mp4`
  const dir = path.join(
    process.cwd(),
    'public',
    'uploads',
    'host-videos',
    input.userId,
  )
  await mkdir(dir, { recursive: true })
  const absPath = path.join(dir, filename)
  await writeFile(absPath, buf)
  // Kompres ke bitrate web (≈5x lebih kecil) supaya live room tidak patah-patah
  // saat ganti scene di HP. Aman: kalau gagal, file asli tetap dipakai.
  let bytes = buf.length
  try {
    const r = await transcodeVideoToWeb(absPath)
    if (r.afterBytes) bytes = r.afterBytes
  } catch {
    /* jangan gagalkan pipeline gara-gara transcode */
  }
  return {
    videoPath: `/uploads/host-videos/${input.userId}/${filename}`,
    bytes,
  }
}

// ─────────────────────────────────────────
// LIP-SYNC ENDPOINT (Sprint 2 — Klip Live mode)
// ─────────────────────────────────────────
// Endpoint: POST /v1/videos/lip-sync (submit) + GET /v1/videos/lip-sync/{task_id} (poll)
//
// Mode yang dipakai: audio2video — kasih video source + audio file → video lip-synced output.
// Video source options:
//   1. video_id (existing Kling task_id) — disarankan, Kling internal reference, gak butuh public URL
//   2. video_url (public URL) — kalau video sumber bukan dari Kling, butuh accessible URL
// Audio file options:
//   1. audio_url (public URL) — disarankan, ringan
//   2. audio_file (base64) — fallback kalau gak ada public URL
//
// DEV NOTE: localhost public URL tidak bisa di-fetch Kling server. Untuk dev:
// pakai video_id dari task Kling sebelumnya (recent task, sebelum URL expire 30hari).
// Untuk production: set PUBLIC_BASE_URL agar audio_url bisa absolute.

export interface KlingLipsyncInput {
  // Pilih salah satu source video:
  sourceVideoId?: string // existing Kling task_id (kadang ditolak error 1201)
  sourceVideoUrl?: string // OR public URL ke MP4
  sourceVideoBase64?: string // OR base64 MP4 (dev mode fallback, hati-hati ukuran)
  // Pilih salah satu audio source:
  audioUrl?: string // public URL ke MP3 (DISARANKAN)
  audioBase64?: string // OR base64 MP3 (kalau public URL belum tersedia)
  // Optional: motion prompt untuk guide motion non-mouth (adaptive prompt dari vision).
  prompt?: string
}

// Submit lip-sync request. Kling akan generate video dengan audio bonded.
export async function submitKlingLipsync(
  input: KlingLipsyncInput,
): Promise<KlingSubmitResult> {
  const auth = await buildKlingAuthHeader()

  if (!input.sourceVideoId && !input.sourceVideoUrl && !input.sourceVideoBase64) {
    throw new Error('Lipsync: butuh sourceVideoId, sourceVideoUrl, atau sourceVideoBase64')
  }
  if (!input.audioUrl && !input.audioBase64) {
    throw new Error('Lipsync: butuh audioUrl atau audioBase64')
  }

  const inputPayload: Record<string, unknown> = {
    mode: 'audio2video',
  }
  // Video source priority: URL > Base64 > VideoId
  // Catatan: VideoId kadang ditolak (Kling error 1201 "From video not found by id")
  // kalau task lama, mode beda, atau model version mismatch — caller harus
  // siapkan fallback base64 (read MP4 dari disk).
  if (input.sourceVideoUrl) {
    inputPayload.video_url = input.sourceVideoUrl
  } else if (input.sourceVideoBase64) {
    inputPayload.video_type = 'file'
    inputPayload.video_file = input.sourceVideoBase64
  } else {
    inputPayload.video_id = input.sourceVideoId
  }
  // Audio source — prioritas URL, fallback base64.
  if (input.audioUrl) {
    inputPayload.audio_type = 'url'
    inputPayload.audio_url = input.audioUrl
  } else {
    inputPayload.audio_type = 'file'
    inputPayload.audio_file = input.audioBase64
  }
  if (input.prompt) {
    inputPayload.prompt = input.prompt
  }

  const body = { input: inputPayload }

  const res = await fetch(`${KLING_HOST}/v1/videos/lip-sync`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: auth,
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Kling lipsync submit gagal HTTP ${res.status}: ${text.slice(0, 400)}`)
  }
  let json: {
    code?: number
    message?: string
    data?: { task_id?: string; task_status?: string }
  }
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Kling lipsync response bukan JSON: ${text.slice(0, 200)}`)
  }
  if (json.code !== 0 || !json.data?.task_id) {
    throw new Error(
      `Kling lipsync error code=${json.code} msg=${json.message ?? '?'}: ${text.slice(0, 200)}`,
    )
  }
  return { requestId: json.data.task_id, model: 'kling-lip-sync' }
}

// Poll lip-sync task — semantik output sama dengan pollKlingStatus untuk image2video.
export async function pollKlingLipsync(input: {
  requestId: string
}): Promise<KlingPollResult> {
  const auth = await buildKlingAuthHeader()
  const url = `${KLING_HOST}/v1/videos/lip-sync/${encodeURIComponent(input.requestId)}`

  const res = await fetch(url, {
    method: 'GET',
    headers: { authorization: auth },
  })
  const text = await res.text()
  if (!res.ok) {
    return { status: 'FAILED', rawError: `HTTP ${res.status}: ${text.slice(0, 300)}` }
  }
  let json: {
    code?: number
    message?: string
    data?: {
      task_status?: string
      task_status_msg?: string
      task_result?: {
        videos?: Array<{ id?: string; url?: string; duration?: string | number }>
      }
    }
  }
  try {
    json = JSON.parse(text)
  } catch {
    return { status: 'FAILED', rawError: `Non-JSON: ${text.slice(0, 200)}` }
  }
  if (json.code !== 0) {
    return {
      status: 'FAILED',
      rawError: `code=${json.code} ${json.message ?? ''}`,
    }
  }
  const s = (json.data?.task_status ?? '').toLowerCase()
  if (s === 'submitted') return { status: 'IN_QUEUE' }
  if (s === 'processing') return { status: 'IN_PROGRESS' }
  if (s === 'failed') {
    return {
      status: 'FAILED',
      rawError: json.data?.task_status_msg ?? 'Kling lipsync task failed',
    }
  }
  if (s === 'succeed' || s === 'succeeded') {
    const vid = json.data?.task_result?.videos?.[0]
    if (!vid?.url) {
      return { status: 'FAILED', rawError: 'lipsync succeed tapi videos.url kosong' }
    }
    return {
      status: 'COMPLETED',
      videoUrl: vid.url,
      durationSeconds:
        typeof vid.duration === 'string' ? parseFloat(vid.duration) : (vid.duration ?? 0),
    }
  }
  return { status: 'IN_PROGRESS' }
}
