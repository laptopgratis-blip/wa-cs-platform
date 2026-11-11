// Aturan murni generate baseline silent-loop sebagai background job (2026-11-11).
//
// File ini SENGAJA tanpa import Prisma / SDK supaya bisa diuji lewat `tsx`
// tanpa DB dan dipakai bersama oleh route, job runner, dan prep-status.
//
// Latar: POST /baselines/generate dulu menunggu submit Kling sampai selesai.
// Saat Kling membalas 429, submit di-retry 150 dtk per baseline — lebih lama
// dari batas Cloudflare 100 dtk → 524 HTML → seller melihat toast mentah
// "Unexpected token '<'…" lalu klik ulang (kasus 2026-11-11: 31× dalam 12 jam,
// tiap klik meninggalkan HostScene GENERATING tanpa job). Sekarang route
// membuat baris scene, submit jalan di `after()`, dan route hanya menunggu
// sebentar (BASELINE_SYNC_WAIT_MS) supaya kasus normal tetap dapat jawaban
// langsung.

// Durasi video baseline (detik) — sumber lipsync semua klip.
export const BASELINE_SECONDS = 10

// Route menunggu hasil submit maksimal selama ini; lewat dari itu balas 202
// dan submit diteruskan di background. Jauh di bawah batas Cloudflare 100 dtk.
export const BASELINE_SYNC_WAIT_MS = 25_000

// Scene GENERATING tanpa generationJobId lebih tua dari ini dianggap submit-nya
// mati (server restart/deploy di tengah `after()`). Wajib > submit sehat
// terlama: retry antrian 150 dtk × maks 8 baseline berurutan ≈ 20 menit.
export const BASELINE_SUBMIT_STALE_MS = 30 * 60_000

// Penanda scene baseline: HostScene tidak punya kolom jenis, dan route
// /scenes (scene TTS biasa) juga membuat scene GENERATING tanpa job. Semua
// baseline — termasuk baris lama sebelum 2026-11-11 — ber-description
// "Baseline custom …" / "Baseline variant …", jadi query status, guard
// in-flight, dan sapuan dibatasi ke prefix ini.
export const BASELINE_SCENE_DESCRIPTION_PREFIX = 'Baseline '

export const BASELINE_SUBMIT_INTERRUPTED_MSG =
  'Pengiriman baseline ke Kling terputus. Silakan generate ulang.'

export const BASELINE_SUBMIT_GENERIC_MSG =
  'Gagal mengirim baseline ke Kling. Coba lagi beberapa saat lagi.'

export type BaselineFailureKind = 'account' | 'balance' | 'queue' | 'other'

export type BaselineSubmitOutcome =
  | { sceneId: string; ok: true }
  | { sceneId: string; ok: false; kind: BaselineFailureKind; message: string }

export interface BaselineSubmitSummary {
  httpStatus: 200 | 402 | 502 | 503
  submitted: number
  failed: number
  message: string
}

const STATUS_BY_KIND: Record<BaselineFailureKind, 402 | 502 | 503> = {
  account: 503,
  balance: 402,
  queue: 502,
  other: 502,
}

export function summarizeBaselineSubmit(
  outcomes: BaselineSubmitOutcome[],
): BaselineSubmitSummary {
  const total = outcomes.length
  const failures = outcomes.filter(
    (o): o is Extract<BaselineSubmitOutcome, { ok: false }> => !o.ok,
  )
  const submitted = total - failures.length
  const firstFailure = failures[0]

  if (!firstFailure) {
    return {
      httpStatus: 200,
      submitted,
      failed: 0,
      message: `${submitted} baseline dikirim ke Kling — jadi dalam ~2–3 menit per baseline. Status muncul otomatis di halaman ini.`,
    }
  }
  if (submitted === 0) {
    return {
      httpStatus: STATUS_BY_KIND[firstFailure.kind],
      submitted: 0,
      failed: failures.length,
      message: firstFailure.message,
    }
  }
  return {
    httpStatus: 200,
    submitted,
    failed: failures.length,
    message: `${submitted} dari ${total} baseline dikirim ke Kling; ${failures.length} gagal: ${firstFailure.message}`,
  }
}

export function isBaselineSubmitStale(createdAt: Date, now: number): boolean {
  return now - createdAt.getTime() > BASELINE_SUBMIT_STALE_MS
}

interface JobLite {
  status: string
  errorMessage: string | null
  createdAt: Date
}

// Scene baseline terbaru yang BELUM punya GenerationJob (masih dikirim, atau
// gagal sebelum task Kling tercipta).
interface OrphanSceneLite {
  status: string
  errorMessage: string | null
  createdAt: Date
}

// Status baseline untuk panel setup Klip Live. Dulu hanya dari GenerationJob
// terbaru — submit yang gagal sebelum job tercipta tidak terlihat sama sekali
// (UI tetap "belum dimulai"). Scene yatim yang lebih baru dari job terakhir
// kini ikut menentukan status.
export function deriveBaselinePrepStatus(input: {
  latestJob: JobLite | null
  latestOrphanScene: OrphanSceneLite | null
}): { baselineVideoStatus: string | null; baselineError: string | null } {
  const { latestJob, latestOrphanScene: scene } = input
  const fromJob = {
    baselineVideoStatus: latestJob?.status ?? null,
    baselineError: latestJob?.errorMessage ?? null,
  }
  if (!scene) return fromJob
  if (latestJob && scene.createdAt <= latestJob.createdAt) return fromJob
  if (scene.status === 'GENERATING') {
    return { baselineVideoStatus: 'RUNNING', baselineError: null }
  }
  if (scene.status === 'FAILED') {
    return {
      baselineVideoStatus: 'FAILED',
      baselineError: scene.errorMessage || BASELINE_SUBMIT_INTERRUPTED_MSG,
    }
  }
  return fromJob
}
