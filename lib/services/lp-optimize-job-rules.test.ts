// Uji aturan murni job optimasi LP AI. Jalankan: npx tsx lib/services/lp-optimize-job-rules.test.ts
import assert from 'node:assert/strict'

import {
  deriveOptimizationView,
  estimateOptimizeDuration,
  friendlyOptimizeError,
  isApplyStale,
  isStaleRunning,
  LP_OPTIMIZE_AI_TIMEOUT_MS,
  LP_OPTIMIZE_STALE_MS,
  LP_OPTIMIZE_STALE_MESSAGE,
  LpOptimizeUserError,
} from './lp-optimize-job-rules'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const NOW = new Date('2026-10-06T10:00:00Z').getTime()
const minutesAgo = (m: number) => new Date(NOW - m * 60_000)

console.log('lp-optimize-job-rules: konstanta')

check(
  'timeout AI 10 menit, basi 15 menit (basi > timeout supaya job sehat tak tersapu)',
  () => {
    assert.equal(LP_OPTIMIZE_AI_TIMEOUT_MS, 600_000)
    assert.equal(LP_OPTIMIZE_STALE_MS, 15 * 60_000)
    assert.ok(LP_OPTIMIZE_STALE_MS > LP_OPTIMIZE_AI_TIMEOUT_MS)
  },
)

console.log('lp-optimize-job-rules: isStaleRunning')

check('RUNNING 16 menit → basi', () => {
  assert.equal(
    isStaleRunning({ status: 'RUNNING', createdAt: minutesAgo(16) }, NOW),
    true,
  )
})
check('RUNNING 5 menit → belum basi', () => {
  assert.equal(
    isStaleRunning({ status: 'RUNNING', createdAt: minutesAgo(5) }, NOW),
    false,
  )
})
check('tepat 15 menit → basi (batas inklusif)', () => {
  assert.equal(
    isStaleRunning({ status: 'RUNNING', createdAt: minutesAgo(15) }, NOW),
    true,
  )
})
check('DONE/FAILED lama → bukan basi', () => {
  assert.equal(
    isStaleRunning({ status: 'DONE', createdAt: minutesAgo(120) }, NOW),
    false,
  )
  assert.equal(
    isStaleRunning({ status: 'FAILED', createdAt: minutesAgo(120) }, NOW),
    false,
  )
})

console.log('lp-optimize-job-rules: friendlyOptimizeError')

check('LpOptimizeUserError → pesan apa adanya', () => {
  const msg = 'LP terlalu besar untuk AI optimization.'
  assert.equal(friendlyOptimizeError(new LpOptimizeUserError(msg)), msg)
})
check('duck-typed by name juga diterima (lintas bundle)', () => {
  const e = Object.assign(new Error('Output AI terpotong.'), {
    name: 'LpOptimizeUserError',
  })
  assert.equal(friendlyOptimizeError(e), 'Output AI terpotong.')
})
check('InsufficientBalanceError → pesan saldo + jumlah token', () => {
  const e = Object.assign(new Error('Saldo token kurang.'), {
    name: 'InsufficientBalanceError',
    tokensRequired: 12_500,
  })
  const msg = friendlyOptimizeError(e)
  assert.match(msg, /Saldo token tidak cukup/)
  assert.match(msg, /12\.500/)
})
check('status 429 → rate limit', () => {
  const e = Object.assign(new Error('rate_limit_error'), { status: 429 })
  assert.match(friendlyOptimizeError(e), /sibuk/i)
})
check('status 529 / overloaded → kelebihan beban', () => {
  assert.match(
    friendlyOptimizeError(Object.assign(new Error('x'), { status: 529 })),
    /kelebihan beban/,
  )
  assert.match(
    friendlyOptimizeError(
      Object.assign(new Error('Overloaded'), {
        status: 500,
        error: { type: 'overloaded_error' },
      }),
    ),
    /kelebihan beban/,
  )
})
check('status 5xx → layanan AI bermasalah', () => {
  assert.match(
    friendlyOptimizeError(Object.assign(new Error('boom'), { status: 503 })),
    /bermasalah/,
  )
})
check('status 4xx lain → ditolak, tanpa membocorkan pesan mentah', () => {
  const msg = friendlyOptimizeError(
    Object.assign(new Error('invalid x-api-key sk-ant-123'), { status: 401 }),
  )
  assert.doesNotMatch(msg, /sk-ant/)
  assert.match(msg, /ditolak/)
})
check(
  'error tak dikenal (mis. Prisma) → pesan generik, tanpa detail internal',
  () => {
    const e = Object.assign(
      new Error('Invalid `prisma.lpOptimization.update()` invocation'),
      {
        name: 'PrismaClientKnownRequestError',
      },
    )
    const msg = friendlyOptimizeError(e)
    assert.doesNotMatch(msg, /prisma/i)
    assert.match(msg, /coba lagi/i)
  },
)
check('non-Error (string/undefined) → pesan generik', () => {
  assert.match(friendlyOptimizeError('x'), /coba lagi/i)
  assert.match(friendlyOptimizeError(undefined), /coba lagi/i)
})
check('pesan tidak mengandung spasi ganda', () => {
  const samples = [
    friendlyOptimizeError(Object.assign(new Error('x'), { status: 429 })),
    friendlyOptimizeError(Object.assign(new Error('x'), { status: 529 })),
    friendlyOptimizeError(undefined),
  ]
  for (const s of samples) assert.doesNotMatch(s, / {2}/)
})

console.log('lp-optimize-job-rules: estimateOptimizeDuration')

check('20K token output → rentang menit wajar', () => {
  const d = estimateOptimizeDuration(20_000)
  // 20000/140 ≈ 143 dtk, 20000/110 ≈ 182 dtk
  assert.ok(d.minSec >= 140 && d.minSec <= 150, `minSec=${d.minSec}`)
  assert.ok(d.maxSec >= 180 && d.maxSec <= 190, `maxSec=${d.maxSec}`)
  assert.equal(d.label, 'sekitar 2–4 menit')
})
check('output kecil → kurang dari 1 menit', () => {
  assert.equal(estimateOptimizeDuration(2_000).label, 'kurang dari 1 menit')
})
check('rentang sempit → satu angka', () => {
  // 7000/140 = 50 dtk → 1 mnt; 7000/110 ≈ 64 dtk → ceil 2? pastikan label konsisten & tak terbalik
  const d = estimateOptimizeDuration(7_000)
  assert.ok(d.minSec <= d.maxSec)
  assert.match(d.label, /^sekitar \d+(–\d+)? menit$/)
})
check('input tak valid (0/negatif/NaN) → tetap ada label aman', () => {
  for (const v of [0, -5, Number.NaN]) {
    const d = estimateOptimizeDuration(v)
    assert.equal(typeof d.label, 'string')
    assert.ok(d.label.length > 0)
    assert.ok(Number.isFinite(d.minSec) && Number.isFinite(d.maxSec))
  }
})

console.log('lp-optimize-job-rules: isApplyStale')

check('HTML sama → tidak basi', () => {
  assert.equal(isApplyStale('<html>a</html>', '<html>a</html>'), false)
})
check('HTML berubah sejak saran dibuat → basi', () => {
  assert.equal(isApplyStale('<html>a</html>', '<html>b</html>'), true)
})
check(
  'beforeHtml null (data lama) → tidak bisa dibandingkan, anggap tidak basi',
  () => {
    assert.equal(isApplyStale(null, '<html>b</html>'), false)
  },
)

console.log('lp-optimize-job-rules: deriveOptimizationView')

const base = {
  status: 'DONE',
  hasAfterHtml: true,
  applied: false,
  errorMessage: null as string | null,
  createdAt: minutesAgo(3),
}

check('DONE + afterHtml + belum apply → canApply', () => {
  const v = deriveOptimizationView(base, NOW)
  assert.deepEqual(v, { status: 'DONE', canApply: true, error: null })
})
check('DONE tapi sudah applied → tidak canApply', () => {
  assert.equal(
    deriveOptimizationView({ ...base, applied: true }, NOW).canApply,
    false,
  )
})
check(
  'DONE tanpa afterHtml (saran rule-based) → tidak canApply, tetap DONE',
  () => {
    const v = deriveOptimizationView({ ...base, hasAfterHtml: false }, NOW)
    assert.equal(v.status, 'DONE')
    assert.equal(v.canApply, false)
  },
)
check('RUNNING segar → RUNNING, tidak canApply walau ada afterHtml', () => {
  const v = deriveOptimizationView({ ...base, status: 'RUNNING' }, NOW)
  assert.deepEqual(v, { status: 'RUNNING', canApply: false, error: null })
})
check('RUNNING basi → tampil FAILED dengan pesan basi', () => {
  const v = deriveOptimizationView(
    { ...base, status: 'RUNNING', createdAt: minutesAgo(30) },
    NOW,
  )
  assert.deepEqual(v, {
    status: 'FAILED',
    canApply: false,
    error: LP_OPTIMIZE_STALE_MESSAGE,
  })
})
check('FAILED → error dari errorMessage (atau generik)', () => {
  assert.equal(
    deriveOptimizationView(
      { ...base, status: 'FAILED', hasAfterHtml: false, errorMessage: 'x' },
      NOW,
    ).error,
    'x',
  )
  const v = deriveOptimizationView(
    { ...base, status: 'FAILED', hasAfterHtml: false },
    NOW,
  )
  assert.equal(v.status, 'FAILED')
  assert.ok(v.error && v.error.length > 0)
})
check(
  'DONE lama dengan errorMessage & tanpa afterHtml (pra-migrasi) → FAILED',
  () => {
    const v = deriveOptimizationView(
      { ...base, hasAfterHtml: false, errorMessage: 'AI timeout' },
      NOW,
    )
    assert.deepEqual(v, {
      status: 'FAILED',
      canApply: false,
      error: 'AI timeout',
    })
  },
)
check('status tak dikenal → diperlakukan DONE', () => {
  assert.equal(
    deriveOptimizationView({ ...base, status: 'WEIRD' }, NOW).status,
    'DONE',
  )
})

console.log(`lp-optimize-job-rules.test.ts: ${passed} kasus lolos`)
