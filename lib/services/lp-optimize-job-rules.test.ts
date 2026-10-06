// Uji aturan murni job optimasi LP AI. Jalankan: npx tsx lib/services/lp-optimize-job-rules.test.ts
import assert from 'node:assert/strict'

import {
  chargedSaveFailureMessage,
  decideApplyOptimization,
  deriveOptimizationView,
  estimateOptimizeDuration,
  friendlyOptimizeError,
  isApplyStale,
  isStaleRunning,
  LP_OPTIMIZE_AI_TIMEOUT_MS,
  LP_OPTIMIZE_STALE_MS,
  LP_OPTIMIZE_STALE_MESSAGE,
  LP_OPTIMIZE_SAVE_RETRY_DELAYS_MS,
  LpOptimizeUserError,
  retryAsync,
  staleFlagsById,
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

console.log('lp-optimize-job-rules: decideApplyOptimization')

const applyBase = {
  status: 'DONE',
  hasAfterHtml: true,
  applied: false,
  errorMessage: null as string | null,
  createdAt: minutesAgo(10),
  beforeHtml: '<html>v1</html>' as string | null,
  currentHtml: '<html>v1</html>',
  force: false,
}

check('DONE, LP tidak berubah → apply', () => {
  assert.deepEqual(decideApplyOptimization(applyBase, NOW), { kind: 'apply' })
})
check('sudah applied → already (idempoten), bahkan kalau LP berubah', () => {
  assert.deepEqual(
    decideApplyOptimization(
      { ...applyBase, applied: true, currentHtml: '<html>v2</html>' },
      NOW,
    ),
    { kind: 'already' },
  )
})
check('RUNNING → 400, belum ada hasil', () => {
  const d = decideApplyOptimization(
    { ...applyBase, status: 'RUNNING', createdAt: minutesAgo(1) },
    NOW,
  )
  assert.equal(d.kind, 'reject')
  if (d.kind === 'reject') {
    assert.equal(d.httpStatus, 400)
    assert.match(d.message, /masih diproses/)
  }
})
check('FAILED → 400', () => {
  const d = decideApplyOptimization(
    { ...applyBase, status: 'FAILED', hasAfterHtml: false, errorMessage: 'x' },
    NOW,
  )
  assert.equal(d.kind, 'reject')
  if (d.kind === 'reject') assert.equal(d.httpStatus, 400)
})
check('DONE tanpa afterHtml (saran rule-based) → 400', () => {
  const d = decideApplyOptimization({ ...applyBase, hasAfterHtml: false }, NOW)
  assert.equal(d.kind, 'reject')
  if (d.kind === 'reject') assert.equal(d.httpStatus, 400)
})
check('LP diedit sejak saran dibuat & tanpa force → 409 STALE', () => {
  const d = decideApplyOptimization(
    { ...applyBase, currentHtml: '<html>v2</html>' },
    NOW,
  )
  assert.equal(d.kind, 'reject')
  if (d.kind === 'reject') {
    assert.equal(d.httpStatus, 409)
    assert.equal(d.code, 'STALE')
    assert.match(d.message, /LP sudah diedit sejak saran ini dibuat/)
  }
})
check('LP diedit tapi force:true → apply', () => {
  assert.deepEqual(
    decideApplyOptimization(
      { ...applyBase, currentHtml: '<html>v2</html>', force: true },
      NOW,
    ),
    { kind: 'apply' },
  )
})
check('force tidak membuka apply untuk job RUNNING/FAILED', () => {
  const d = decideApplyOptimization(
    { ...applyBase, status: 'RUNNING', createdAt: minutesAgo(1), force: true },
    NOW,
  )
  assert.equal(d.kind, 'reject')
})

console.log('lp-optimize-job-rules: staleFlagsById (hasil cek basi di DB)')

check('hanya boolean true yang dianggap basi', () => {
  const map = staleFlagsById([
    { id: 'a', stale: true },
    { id: 'b', stale: false },
    { id: 'c', stale: null },
  ])
  assert.equal(map.get('a'), true)
  assert.equal(map.get('b'), false)
  assert.equal(map.get('c'), false)
  assert.equal(map.has('d'), false)
})

console.log('lp-optimize-job-rules: chargedSaveFailureMessage')

check('menyebut token terpotong + arahkan hubungi admin', () => {
  const msg = chargedSaveFailureMessage(2100)
  assert.match(msg, /2\.100 token/)
  assert.match(msg, /admin/i)
  assert.ok(!/\s{2}/.test(msg))
})
check('token tak valid → tetap pesan aman tanpa angka', () => {
  const msg = chargedSaveFailureMessage(Number.NaN)
  assert.ok(!/NaN/.test(msg))
  assert.match(msg, /admin/i)
})

console.log('lp-optimize-job-rules: retryAsync')

async function checkAsync(name: string, fn: () => Promise<void>): Promise<void> {
  await fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const noSleep = async (): Promise<void> => {}

async function runAsyncChecks(): Promise<void> {
  await checkAsync('jeda retry simpan hasil wajar (≥ 2 kali coba ulang)', async () => {
    assert.ok(LP_OPTIMIZE_SAVE_RETRY_DELAYS_MS.length >= 2)
    assert.ok(LP_OPTIMIZE_SAVE_RETRY_DELAYS_MS.every((ms) => ms > 0))
  })
  await checkAsync('sukses di percobaan pertama → tanpa jeda', async () => {
    const slept: number[] = []
    const out = await retryAsync(async () => 'ok', {
      delaysMs: [10, 20],
      sleep: async (ms) => {
        slept.push(ms)
      },
    })
    assert.equal(out, 'ok')
    assert.deepEqual(slept, [])
  })
  await checkAsync('gagal 2× lalu sukses → jeda sesuai urutan', async () => {
    let calls = 0
    const slept: number[] = []
    const out = await retryAsync(
      async () => {
        calls += 1
        if (calls < 3) throw new Error(`gagal ${calls}`)
        return calls
      },
      {
        delaysMs: [10, 20, 30],
        sleep: async (ms) => {
          slept.push(ms)
        },
      },
    )
    assert.equal(out, 3)
    assert.deepEqual(slept, [10, 20])
  })
  await checkAsync('selalu gagal → lempar error TERAKHIR setelah semua percobaan', async () => {
    let calls = 0
    await assert.rejects(
      retryAsync(
        async () => {
          calls += 1
          throw new Error(`gagal ${calls}`)
        },
        { delaysMs: [1, 1], sleep: noSleep },
      ),
      /gagal 3/,
    )
    assert.equal(calls, 3)
  })
  await checkAsync('onRetry dipanggil per kegagalan yang akan dicoba ulang', async () => {
    const seen: number[] = []
    await assert.rejects(
      retryAsync(
        async () => {
          throw new Error('x')
        },
        {
          delaysMs: [1, 1],
          sleep: noSleep,
          onRetry: (attempt) => {
            seen.push(attempt)
          },
        },
      ),
    )
    assert.deepEqual(seen, [1, 2])
  })
}

runAsyncChecks()
  .then(() => {
    console.log(`lp-optimize-job-rules.test.ts: ${passed} kasus lolos`)
  })
  .catch((err: unknown) => {
    console.error(err)
    process.exit(1)
  })
