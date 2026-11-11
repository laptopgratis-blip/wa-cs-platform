// Test unit klasifikasi error Kling transient vs permanen.
// Jalankan: npx tsx lib/services/host-gen/kling-retry.test.ts
import assert from 'node:assert'

import {
  classifyKlingSubmitFailure,
  clearKlingAccountOutage,
  getKlingAccountOutage,
  isTransientKlingTaskFailure,
  KLING_ACCOUNT_OUTAGE_TTL_MS,
  KlingAccountError,
  MAX_KLING_AUTO_RETRIES,
  noteKlingAccountFailure,
} from './kling-retry'

// Task-level transient dari Kling (task_status_msg) → layak retry.
assert.equal(isTransientKlingTaskFailure('generation time out'), true)
assert.equal(isTransientKlingTaskFailure('Generation Time-Out'), true)
assert.equal(isTransientKlingTaskFailure('generation timeout'), true)
assert.equal(
  isTransientKlingTaskFailure('internal error, please try again'),
  true,
)
assert.equal(isTransientKlingTaskFailure('service busy, try again later'), true)
assert.equal(isTransientKlingTaskFailure('service unavailable'), true)
assert.equal(isTransientKlingTaskFailure('system error'), true)

// Error TRANSPORT poll (HTTP/parse/envelope) → task mungkin masih hidup,
// JANGAN retry walau teksnya mengandung kata transient.
assert.equal(
  isTransientKlingTaskFailure('HTTP 500: Internal Server Error'),
  false,
)
assert.equal(isTransientKlingTaskFailure('HTTP 504: gateway time out'), false)
assert.equal(
  isTransientKlingTaskFailure('Non-JSON: <html>server error</html>'),
  false,
)
assert.equal(
  isTransientKlingTaskFailure(
    'code=1303 parallel task over resource pack limit',
  ),
  false,
)

// Error permanen (bukan transient) → jangan retry.
assert.equal(
  isTransientKlingTaskFailure('risk control: content policy violation'),
  false,
)
assert.equal(isTransientKlingTaskFailure('From video not found by id'), false)

// Edge: kosong / null / undefined.
assert.equal(isTransientKlingTaskFailure(''), false)
assert.equal(isTransientKlingTaskFailure(null), false)
assert.equal(isTransientKlingTaskFailure(undefined), false)

// Guard konstanta: bounded, bukan retry tak terbatas.
assert.ok(MAX_KLING_AUTO_RETRIES >= 1 && MAX_KLING_AUTO_RETRIES <= 3)

// ── Klasifikasi gagal SUBMIT (2026-11-11) ────────────────────────────────
// Insiden: Kling balas HTTP 429 code 1102 "Account balance not enough"
// (resource pack habis). Dulu SEMUA 429 dianggap antrian penuh → retry
// 150 dtk → route sinkron kena 524 Cloudflare. Sekarang hanya 1302/1303
// (rate / task paralel) yang di-retry; masalah akun gagal cepat.
const body = (code: number, message = 'x') =>
  JSON.stringify({ code, message, request_id: 'r' })

assert.deepEqual(
  classifyKlingSubmitFailure(429, body(1102, 'Account balance not enough')),
  {
    kind: 'account',
    code: 1102,
  },
)
for (const code of [1100, 1101, 1103, 1304]) {
  assert.equal(
    classifyKlingSubmitFailure(429, body(code)).kind,
    'account',
    `code ${code}`,
  )
}
// Auth/kunci API rusak = masalah konfigurasi platform, bukan salah seller.
for (const code of [1000, 1001, 1002, 1003, 1004]) {
  assert.equal(
    classifyKlingSubmitFailure(401, body(code)).kind,
    'account',
    `code ${code}`,
  )
}
// Antrian/rate → layak retry.
assert.deepEqual(classifyKlingSubmitFailure(429, body(1303)), {
  kind: 'queue',
  code: 1303,
})
assert.deepEqual(classifyKlingSubmitFailure(429, body(1302)), {
  kind: 'queue',
  code: 1302,
})
// 429 tanpa body JSON / code tak dikenal → perlakuan lama (antrian, retry).
assert.deepEqual(classifyKlingSubmitFailure(429, '<html>Too Many</html>'), {
  kind: 'queue',
  code: null,
})
assert.deepEqual(classifyKlingSubmitFailure(429, ''), {
  kind: 'queue',
  code: null,
})
assert.deepEqual(classifyKlingSubmitFailure(429, body(1999)), {
  kind: 'queue',
  code: 1999,
})
// Kode akun tetap 'account' walau dibungkus HTTP 200 (envelope code != 0).
assert.equal(classifyKlingSubmitFailure(200, body(1102)).kind, 'account')
// Error lain (param, konten, server) → other, tidak di-retry.
assert.deepEqual(classifyKlingSubmitFailure(400, body(1201)), {
  kind: 'other',
  code: 1201,
})
assert.deepEqual(classifyKlingSubmitFailure(500, 'Internal Server Error'), {
  kind: 'other',
  code: null,
})

// KlingAccountError: pesan aman tampil ke seller (tanpa JSON/teks provider).
const accErr = new KlingAccountError(1102)
assert.ok(accErr instanceof Error)
assert.equal(accErr.code, 1102)
assert.ok(
  !/\{|1102|balance/i.test(accErr.message),
  'pesan tidak bocorkan detail provider',
)
// Tanpa klaim soal token: jalur lipsync sudah memotong token TTS sebelum submit.
assert.ok(!/token/i.test(accErr.message), 'jangan klaim apa pun soal token')
assert.match(accErr.message, /tidak tersedia/)

// ── Memo gangguan akun (circuit breaker in-process) ─────────────────────
const t0 = 1_000_000
clearKlingAccountOutage()
assert.equal(getKlingAccountOutage(t0), null)
noteKlingAccountFailure(1102, t0)
assert.deepEqual(getKlingAccountOutage(t0 + 1000), { code: 1102, since: t0 })
assert.ok(getKlingAccountOutage(t0 + KLING_ACCOUNT_OUTAGE_TTL_MS - 1))
assert.equal(getKlingAccountOutage(t0 + KLING_ACCOUNT_OUTAGE_TTL_MS + 1), null)
// Gagal berulang memperpanjang jendela dari kegagalan TERAKHIR, `since` tetap awal.
noteKlingAccountFailure(1102, t0)
noteKlingAccountFailure(1102, t0 + 60_000)
assert.deepEqual(
  getKlingAccountOutage(t0 + KLING_ACCOUNT_OUTAGE_TTL_MS + 30_000),
  {
    code: 1102,
    since: t0,
  },
)
// Submit sukses menghapus memo.
clearKlingAccountOutage()
assert.equal(getKlingAccountOutage(t0 + 61_000), null)
// TTL wajar: cukup menahan klik beruntun, tidak lama mengunci setelah top-up.
assert.ok(
  KLING_ACCOUNT_OUTAGE_TTL_MS >= 60_000 &&
    KLING_ACCOUNT_OUTAGE_TTL_MS <= 10 * 60_000,
)

console.log('kling-retry ok')
