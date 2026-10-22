// Aturan murni generate klip Klip Live sebagai background job (2026-10-22).
//
// File ini SENGAJA tanpa import Prisma / SDK supaya bisa diuji lewat `tsx`
// tanpa DB dan dipakai bersama oleh route, job runner, cron, maupun UI client.
//
// Latar: generate klip (TTS → Kling lipsync) makan 220–270 dtk, sedangkan
// Cloudflare memutus request di 100 dtk (524). User melihat toast mentah
// "Unexpected token '<'…", mengira gagal, lalu klik ulang → klip & token dobel
// (kasus 2026-10-22: 4 duplikat ≈9.900 token). Sekarang route hanya membuat
// baris klip lalu pipeline jalan di belakang (`after()`); UI polling list.

// Status klip yang masih diproses (belum READY/FAILED).
export const IN_FLIGHT_CLIP_STATUSES = [
  'DRAFT',
  'GENERATING_AUDIO',
  'GENERATING_VIDEO',
  'PROCESSING_EMBEDDING',
] as const

export type InFlightClipStatus = (typeof IN_FLIGHT_CLIP_STATUSES)[number]

export function isClipInFlight(status: string): boolean {
  return (IN_FLIGHT_CLIP_STATUSES as readonly string[]).includes(status)
}

// Tag penanda klip IDLE hasil Kling image2video (bukan lipsync). Dipakai cron
// finalizer untuk memilih endpoint poll Kling yang benar.
export const IDLE_MOTION_TAG = 'idle-motion'

// Klip yang tidak bergerak (updatedAt) selama ini dianggap prosesnya mati
// (server restart/OOM/deploy di tengah pipeline). Dua ambang:
// - Task Kling sudah tersubmit (atau embedding): wajib > jeda sunyi terpanjang
//   job sehat — poll Kling 300 dtk + download/transcode ≤180 dtk ≈ 8 menit.
//   Serah-terima terlalu cepat = job hidup & cron sama-sama finalize (bayar
//   dobel), jadi diberi margin lebar.
// - Belum ada task Kling (TTS / submit): jeda terpanjang = timeout TTS 60 dtk
//   + lookup suara 15 dtk + backoff submit 429 ≤150 dtk ≈ 4 menit. Ambang
//   lebih pendek supaya user tidak tertahan lama oleh job yang sudah mati.
export const CLIP_STALE_MS = 20 * 60_000
export const CLIP_STALE_EARLY_MS = 10 * 60_000

export const CLIP_STALE_MESSAGE =
  'Proses generate terhenti sebelum selesai (server restart). Silakan Retry.'

// Script dianggap sama walau beda spasi/kapital — kunci anti klik-ganda.
export function normalizeClipScript(script: string): string {
  return script.trim().replace(/\s+/g, ' ').toLowerCase()
}

export interface StaleClipRow {
  status: string
  klingJobId: string | null
  errorMessage: string | null
  videoUrl: string | null
  updatedAt: Date
}

// Tindakan sapuan untuk klip in-flight yang macet:
// - HAND_OFF: task Kling sudah tersubmit → serahkan ke cron finalizer (poll
//   hasil tanpa submit ulang = tanpa biaya Kling dobel).
// - READY: video sudah tersimpan, cuma embedding yang tak sempat selesai.
// - FAILED: belum ada task Kling yang bisa diselamatkan.
// - null: masih sehat / bukan in-flight / sudah dipegang cron.
export type StaleClipAction = 'HAND_OFF' | 'READY' | 'FAILED' | null

export function classifyStaleClip(
  row: StaleClipRow,
  lateMarkers: readonly string[],
  now: number = Date.now(),
): StaleClipAction {
  if (!isClipInFlight(row.status)) return null
  // Marker "Kling lambat" = sudah diurus cron finalizer (punya deadline sendiri).
  if (row.errorMessage && lateMarkers.includes(row.errorMessage)) return null
  const idleMs = now - row.updatedAt.getTime()
  if (row.status === 'PROCESSING_EMBEDDING') {
    if (idleMs < CLIP_STALE_MS) return null
    // READY tanpa embedding — bisa dilengkapi lewat tombol "Sync embed"
    // (embed-backfill mengisi klip ber-embedding NULL).
    return row.videoUrl ? 'READY' : 'FAILED'
  }
  if (row.status === 'GENERATING_VIDEO' && row.klingJobId) {
    return idleMs < CLIP_STALE_MS ? null : 'HAND_OFF'
  }
  return idleMs < CLIP_STALE_EARLY_MS ? null : 'FAILED'
}

// Klip masih dipegang job/cron yang hidup → jangan boleh dihapus/diedit
// (job tetap jalan & memotong token untuk klip yang sudah tidak ada, dan
// guard anti klik-ganda jadi bolong). Klip macet (sudah lewat ambang) boleh.
export function isClipBusy(
  row: StaleClipRow,
  lateMarkers: readonly string[],
  now: number = Date.now(),
): boolean {
  return isClipInFlight(row.status) && classifyStaleClip(row, lateMarkers, now) === null
}

export interface ClipStatusSnapshot {
  id: string
  status: string
  errorMessage: string | null
  scriptOriginal: string
}

export interface ClipTransition {
  id: string
  outcome: 'READY' | 'FAILED'
  label: string
  errorMessage: string | null
}

// Potongan pesan error untuk toast — errorMessage bisa memuat teks mentah
// provider s/d 1000 karakter; detail lengkap tetap di kartu klip.
export const TOAST_ERROR_MAX = 120

export function shortErrorText(message: string | null): string {
  if (!message) return 'silakan Retry'
  const flat = message.trim().replace(/\s+/g, ' ')
  return flat.length > TOAST_ERROR_MAX
    ? `${flat.slice(0, TOAST_ERROR_MAX)}…`
    : flat
}

// Klip yang sebelumnya in-flight lalu kini selesai — dasar toast "Klip siap" /
// "Klip gagal" saat polling. Klip yang baru muncul langsung terminal tidak
// dilaporkan (mis. load awal halaman).
export function diffClipTransitions(
  previous: ReadonlyMap<string, string>,
  next: readonly ClipStatusSnapshot[],
): ClipTransition[] {
  const out: ClipTransition[] = []
  for (const clip of next) {
    const before = previous.get(clip.id)
    if (!before || !isClipInFlight(before)) continue
    if (clip.status !== 'READY' && clip.status !== 'FAILED') continue
    out.push({
      id: clip.id,
      outcome: clip.status,
      label: shortClipLabel(clip.scriptOriginal),
      errorMessage: clip.errorMessage,
    })
  }
  return out
}

const LABEL_MAX = 40

export function shortClipLabel(script: string): string {
  const flat = script.trim().replace(/\s+/g, ' ')
  return flat.length > LABEL_MAX ? `${flat.slice(0, LABEL_MAX)}…` : flat
}
