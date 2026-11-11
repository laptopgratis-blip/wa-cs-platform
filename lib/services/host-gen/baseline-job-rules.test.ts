// Test unit aturan murni generate baseline sebagai background job.
// Jalankan: npx tsx lib/services/host-gen/baseline-job-rules.test.ts
import assert from 'node:assert'

import {
  BASELINE_SCENE_DESCRIPTION_PREFIX,
  BASELINE_SUBMIT_INTERRUPTED_MSG,
  BASELINE_SUBMIT_STALE_MS,
  BASELINE_SYNC_WAIT_MS,
  deriveBaselinePrepStatus,
  isBaselineSubmitStale,
  summarizeBaselineSubmit,
} from './baseline-job-rules'

const at = (iso: string) => new Date(iso)

// ── summarizeBaselineSubmit ─────────────────────────────────────────────
{
  const all = summarizeBaselineSubmit([
    { sceneId: 'a', ok: true },
    { sceneId: 'b', ok: true },
  ])
  assert.equal(all.httpStatus, 200)
  assert.equal(all.submitted, 2)
  assert.equal(all.failed, 0)
  assert.match(all.message, /2 baseline/)
}
{
  const partial = summarizeBaselineSubmit([
    { sceneId: 'a', ok: true },
    { sceneId: 'b', ok: false, kind: 'queue', message: 'Antrian penuh.' },
  ])
  assert.equal(partial.httpStatus, 200)
  assert.equal(partial.submitted, 1)
  assert.equal(partial.failed, 1)
  assert.match(partial.message, /1 dari 2/)
  assert.match(partial.message, /Antrian penuh\./)
}
// Semua gagal → status mengikuti penyebab kegagalan pertama.
{
  const account = summarizeBaselineSubmit([
    {
      sceneId: 'a',
      ok: false,
      kind: 'account',
      message: 'Layanan tidak tersedia.',
    },
    {
      sceneId: 'b',
      ok: false,
      kind: 'account',
      message: 'Layanan tidak tersedia.',
    },
  ])
  assert.equal(account.httpStatus, 503)
  assert.equal(account.submitted, 0)
  assert.equal(account.message, 'Layanan tidak tersedia.')
}
assert.equal(
  summarizeBaselineSubmit([
    { sceneId: 'a', ok: false, kind: 'balance', message: 'Saldo kurang.' },
  ]).httpStatus,
  402,
)
assert.equal(
  summarizeBaselineSubmit([
    { sceneId: 'a', ok: false, kind: 'queue', message: 'Antrian.' },
  ]).httpStatus,
  502,
)
assert.equal(
  summarizeBaselineSubmit([
    { sceneId: 'a', ok: false, kind: 'other', message: 'Gagal.' },
  ]).httpStatus,
  502,
)

// ── isBaselineSubmitStale ───────────────────────────────────────────────
{
  const now = at('2026-11-11T02:00:00Z').getTime()
  assert.equal(
    isBaselineSubmitStale(new Date(now - BASELINE_SUBMIT_STALE_MS - 1), now),
    true,
  )
  assert.equal(isBaselineSubmitStale(new Date(now - 60_000), now), false)
  // Ambang wajib > waktu submit terlama yang sehat (retry antrian 150 dtk ×
  // maks 8 baseline berurutan ≈ 20 mnt) supaya job hidup tidak disapu.
  assert.ok(BASELINE_SUBMIT_STALE_MS >= 25 * 60_000)
  // Respons sinkron wajib jauh di bawah batas Cloudflare 100 dtk.
  assert.ok(BASELINE_SYNC_WAIT_MS > 0 && BASELINE_SYNC_WAIT_MS <= 60_000)
}

// ── deriveBaselinePrepStatus ────────────────────────────────────────────
// Tanpa job & tanpa scene yatim → belum dimulai.
assert.deepEqual(
  deriveBaselinePrepStatus({ latestJob: null, latestOrphanScene: null }),
  {
    baselineVideoStatus: null,
    baselineError: null,
  },
)
// Status job lama dipertahankan kalau tak ada scene yatim yang lebih baru.
assert.deepEqual(
  deriveBaselinePrepStatus({
    latestJob: {
      status: 'FAILED',
      errorMessage: 'Kling failed',
      createdAt: at('2026-11-11T01:00:00Z'),
    },
    latestOrphanScene: {
      status: 'FAILED',
      errorMessage: 'lama',
      createdAt: at('2026-11-10T01:00:00Z'),
    },
  }),
  { baselineVideoStatus: 'FAILED', baselineError: 'Kling failed' },
)
// Scene masih dikirim (belum punya job) & lebih baru → tampil RUNNING.
assert.deepEqual(
  deriveBaselinePrepStatus({
    latestJob: null,
    latestOrphanScene: {
      status: 'GENERATING',
      errorMessage: null,
      createdAt: at('2026-11-11T02:00:00Z'),
    },
  }),
  { baselineVideoStatus: 'RUNNING', baselineError: null },
)
// Submit gagal (scene FAILED tanpa job) lebih baru dari job lama → FAILED + pesan scene.
assert.deepEqual(
  deriveBaselinePrepStatus({
    latestJob: {
      status: 'DONE',
      errorMessage: null,
      createdAt: at('2026-11-01T00:00:00Z'),
    },
    latestOrphanScene: {
      status: 'FAILED',
      errorMessage: 'Layanan tidak tersedia.',
      createdAt: at('2026-11-11T02:00:00Z'),
    },
  }),
  { baselineVideoStatus: 'FAILED', baselineError: 'Layanan tidak tersedia.' },
)
// Scene FAILED tanpa pesan → pakai pesan default, bukan null.
assert.equal(
  deriveBaselinePrepStatus({
    latestJob: null,
    latestOrphanScene: {
      status: 'FAILED',
      errorMessage: null,
      createdAt: at('2026-11-11T02:00:00Z'),
    },
  }).baselineError,
  BASELINE_SUBMIT_INTERRUPTED_MSG,
)
// Status scene lain (DRAFT/READY) diabaikan.
assert.deepEqual(
  deriveBaselinePrepStatus({
    latestJob: {
      status: 'RUNNING',
      errorMessage: null,
      createdAt: at('2026-11-11T01:00:00Z'),
    },
    latestOrphanScene: {
      status: 'DRAFT',
      errorMessage: null,
      createdAt: at('2026-11-11T02:00:00Z'),
    },
  }),
  { baselineVideoStatus: 'RUNNING', baselineError: null },
)

// ── Penanda scene baseline ─────────────────────────────────────────────
// Baris lama (sebelum 2026-11-11) wajib tetap tercakup supaya scene yatim
// lama ikut disapu; scene TTS biasa dari route /scenes tidak boleh tercakup.
for (const legacy of [
  'Baseline custom (motion script di-edit di composer)',
  'Baseline variant A untuk Klip Live lipsync rotation',
]) {
  assert.ok(legacy.startsWith(BASELINE_SCENE_DESCRIPTION_PREFIX), legacy)
}
assert.equal(
  'Sapa penonton sambil senyum'.startsWith(BASELINE_SCENE_DESCRIPTION_PREFIX),
  false,
)

console.log('baseline-job-rules ok')
