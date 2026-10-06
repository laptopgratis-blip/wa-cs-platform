// Aturan murni job optimasi LP AI (background job + polling).
//
// File ini SENGAJA tanpa import Prisma / SDK Anthropic supaya bisa diuji lewat
// `tsx` tanpa DB dan dipakai di route, job runner, maupun service AI.
//
// Latar: optimasi AI sinkron makan 144–212 dtk, sedangkan Cloudflare memutus
// request di 100 dtk (524). Sekarang route hanya membuat baris RUNNING lalu
// job jalan di belakang (`after()`); client polling status.

// Batas waktu panggilan AI di job. Jauh di atas durasi normal (≤ 4 menit
// untuk output 30K token) tapi tetap terbatas supaya baris tak menggantung.
export const LP_OPTIMIZE_AI_TIMEOUT_MS = 600_000

// Baris RUNNING lebih tua dari ini dianggap mati (server restart / deploy
// membunuh proses di tengah jalan). Wajib > timeout AI supaya job yang masih
// sehat tidak ikut tersapu.
export const LP_OPTIMIZE_STALE_MS = 15 * 60_000

export const LP_OPTIMIZE_STALE_MESSAGE =
  'Proses optimasi terhenti sebelum selesai (server restart/timeout). Silakan jalankan ulang.'

const GENERIC_FAILURE_MESSAGE =
  'Optimasi AI gagal karena kesalahan tak terduga. Silakan coba lagi beberapa saat lagi.'

export type LpOptimizationStatus = 'RUNNING' | 'DONE' | 'FAILED'

// Error yang pesannya memang ditulis untuk user (Bahasa Indonesia, tanpa
// detail internal) — diteruskan apa adanya oleh friendlyOptimizeError.
export class LpOptimizeUserError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LpOptimizeUserError'
  }
}

export function isStaleRunning(
  row: { status: string; createdAt: Date },
  now: number = Date.now(),
): boolean {
  if (row.status !== 'RUNNING') return false
  return now - row.createdAt.getTime() >= LP_OPTIMIZE_STALE_MS
}

// ─────────────────────────────────────────
// Pesan error ramah — duck-typed supaya tidak perlu import kelas SDK/Prisma.
// ─────────────────────────────────────────

interface ErrorLike {
  name?: unknown
  message?: unknown
  status?: unknown
  tokensRequired?: unknown
  error?: unknown
}

function asErrorLike(err: unknown): ErrorLike | null {
  return err && typeof err === 'object' ? (err as ErrorLike) : null
}

function isOverloaded(e: ErrorLike): boolean {
  if (e.status === 529) return true
  const inner = asErrorLike(e.error)
  const innerType =
    inner && 'type' in inner ? (inner as { type?: unknown }).type : undefined
  if (innerType === 'overloaded_error') return true
  return typeof e.message === 'string' && /overloaded/i.test(e.message)
}

export function friendlyOptimizeError(err: unknown): string {
  const e = asErrorLike(err)
  if (!e) return GENERIC_FAILURE_MESSAGE

  if (
    e.name === 'LpOptimizeUserError' &&
    typeof e.message === 'string' &&
    e.message
  ) {
    return e.message
  }

  if (
    e.name === 'InsufficientBalanceError' ||
    typeof e.tokensRequired === 'number'
  ) {
    const required =
      typeof e.tokensRequired === 'number'
        ? ` Butuh ±${e.tokensRequired.toLocaleString('id-ID')} token.`
        : ''
    return `Saldo token tidak cukup.${required} Top-up dulu lalu jalankan ulang.`
  }

  if (isOverloaded(e)) {
    return 'Layanan AI sedang kelebihan beban. Coba lagi beberapa menit lagi.'
  }

  const status = typeof e.status === 'number' ? e.status : null
  if (status === 429) {
    return 'Layanan AI sedang sibuk (batas permintaan tercapai). Coba lagi beberapa menit lagi.'
  }
  if (status !== null && status >= 500) {
    return 'Layanan AI sedang bermasalah. Coba lagi beberapa saat lagi.'
  }
  if (status !== null && status >= 400) {
    return 'Permintaan ke layanan AI ditolak. Coba lagi, atau hubungi admin kalau berulang.'
  }

  return GENERIC_FAILURE_MESSAGE
}

// ─────────────────────────────────────────
// Estimasi durasi — throughput Haiku ±110–140 token output per detik.
// ─────────────────────────────────────────

const FAST_TOKENS_PER_SEC = 140
const SLOW_TOKENS_PER_SEC = 110

export interface OptimizeDurationEstimate {
  minSec: number
  maxSec: number
  label: string
}

export function estimateOptimizeDuration(
  estimatedOutputTokens: number,
): OptimizeDurationEstimate {
  const tokens =
    Number.isFinite(estimatedOutputTokens) && estimatedOutputTokens > 0
      ? estimatedOutputTokens
      : 0
  const minSec = Math.round(tokens / FAST_TOKENS_PER_SEC)
  const maxSec = Math.round(tokens / SLOW_TOKENS_PER_SEC)

  if (maxSec < 60) {
    return { minSec, maxSec, label: 'kurang dari 1 menit' }
  }
  const minMin = Math.max(1, Math.round(minSec / 60))
  const maxMin = Math.max(minMin, Math.ceil(maxSec / 60))
  const label =
    minMin === maxMin
      ? `sekitar ${minMin} menit`
      : `sekitar ${minMin}–${maxMin} menit`
  return { minSec, maxSec, label }
}

// Saran AI dibuat dari snapshot `beforeHtml`. Kalau LP sudah diedit sejak
// itu, apply akan menimpa editan tersebut — wajib konfirmasi user.
export function isApplyStale(
  beforeHtml: string | null,
  currentHtml: string,
): boolean {
  if (beforeHtml === null) return false
  return beforeHtml !== currentHtml
}

// ─────────────────────────────────────────
// Tampilan status satu baris LpOptimization (dipakai list + endpoint status).
// ─────────────────────────────────────────

export interface OptimizationViewInput {
  status: string
  hasAfterHtml: boolean
  applied: boolean
  errorMessage: string | null
  createdAt: Date
}

export interface OptimizationView {
  status: LpOptimizationStatus
  canApply: boolean
  error: string | null
}

function normalizeStatus(
  input: OptimizationViewInput,
  now: number,
): LpOptimizationStatus {
  if (input.status === 'RUNNING') {
    return isStaleRunning(input, now) ? 'FAILED' : 'RUNNING'
  }
  if (input.status === 'FAILED') return 'FAILED'
  // Baris pra-migrasi: gagal tercatat lewat errorMessage tanpa hasil HTML.
  if (input.errorMessage && !input.hasAfterHtml) return 'FAILED'
  return 'DONE'
}

export function deriveOptimizationView(
  input: OptimizationViewInput,
  now: number = Date.now(),
): OptimizationView {
  const status = normalizeStatus(input, now)
  if (status === 'RUNNING') return { status, canApply: false, error: null }
  if (status === 'FAILED') {
    const staleRunning = input.status === 'RUNNING'
    const error = staleRunning
      ? LP_OPTIMIZE_STALE_MESSAGE
      : (input.errorMessage ?? GENERIC_FAILURE_MESSAGE)
    return { status, canApply: false, error }
  }
  return { status, canApply: input.hasAfterHtml && !input.applied, error: null }
}

// ─────────────────────────────────────────
// Keputusan apply hasil optimasi ke LP.
// ─────────────────────────────────────────

export const LP_APPLY_STALE_MESSAGE =
  'LP sudah diedit sejak saran ini dibuat. Apply akan menimpa editan tersebut — versi saat ini tetap tersimpan di Riwayat Versi dan bisa dipulihkan.'

export interface ApplyDecisionInput extends OptimizationViewInput {
  beforeHtml: string | null
  currentHtml: string
  // User sudah mengonfirmasi menimpa editan terbaru.
  force: boolean
}

export type ApplyDecision =
  | { kind: 'apply' }
  | { kind: 'already' }
  | { kind: 'reject'; httpStatus: 400 | 409; message: string; code?: 'STALE' }

export function decideApplyOptimization(
  input: ApplyDecisionInput,
  now: number = Date.now(),
): ApplyDecision {
  if (input.applied) return { kind: 'already' }

  const view = deriveOptimizationView(input, now)
  if (view.status === 'RUNNING') {
    return {
      kind: 'reject',
      httpStatus: 400,
      message: 'Optimasi masih diproses — tunggu sampai selesai.',
    }
  }
  if (view.status === 'FAILED') {
    return {
      kind: 'reject',
      httpStatus: 400,
      message: 'Optimasi ini gagal, tidak ada hasil untuk di-apply.',
    }
  }
  if (!input.hasAfterHtml) {
    return {
      kind: 'reject',
      httpStatus: 400,
      message: 'Optimasi ini tidak punya hasil HTML untuk di-apply.',
    }
  }
  if (!input.force && isApplyStale(input.beforeHtml, input.currentHtml)) {
    return {
      kind: 'reject',
      httpStatus: 409,
      code: 'STALE',
      message: LP_APPLY_STALE_MESSAGE,
    }
  }
  return { kind: 'apply' }
}
