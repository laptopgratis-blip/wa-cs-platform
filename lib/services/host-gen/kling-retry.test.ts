// Test unit klasifikasi error Kling transient vs permanen.
// Jalankan: npx tsx lib/services/host-gen/kling-retry.test.ts
import assert from 'node:assert'

import { isTransientKlingTaskFailure, MAX_KLING_AUTO_RETRIES } from './kling-retry'

// Task-level transient dari Kling (task_status_msg) → layak retry.
assert.equal(isTransientKlingTaskFailure('generation time out'), true)
assert.equal(isTransientKlingTaskFailure('Generation Time-Out'), true)
assert.equal(isTransientKlingTaskFailure('generation timeout'), true)
assert.equal(isTransientKlingTaskFailure('internal error, please try again'), true)
assert.equal(isTransientKlingTaskFailure('service busy, try again later'), true)
assert.equal(isTransientKlingTaskFailure('service unavailable'), true)
assert.equal(isTransientKlingTaskFailure('system error'), true)

// Error TRANSPORT poll (HTTP/parse/envelope) → task mungkin masih hidup,
// JANGAN retry walau teksnya mengandung kata transient.
assert.equal(isTransientKlingTaskFailure('HTTP 500: Internal Server Error'), false)
assert.equal(isTransientKlingTaskFailure('HTTP 504: gateway time out'), false)
assert.equal(isTransientKlingTaskFailure('Non-JSON: <html>server error</html>'), false)
assert.equal(isTransientKlingTaskFailure('code=1303 parallel task over resource pack limit'), false)

// Error permanen (bukan transient) → jangan retry.
assert.equal(isTransientKlingTaskFailure('risk control: content policy violation'), false)
assert.equal(isTransientKlingTaskFailure('From video not found by id'), false)

// Edge: kosong / null / undefined.
assert.equal(isTransientKlingTaskFailure(''), false)
assert.equal(isTransientKlingTaskFailure(null), false)
assert.equal(isTransientKlingTaskFailure(undefined), false)

// Guard konstanta: bounded, bukan retry tak terbatas.
assert.ok(MAX_KLING_AUTO_RETRIES >= 1 && MAX_KLING_AUTO_RETRIES <= 3)

console.log('kling-retry ok')
