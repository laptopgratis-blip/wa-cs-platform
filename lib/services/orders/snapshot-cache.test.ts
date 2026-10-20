import assert from 'node:assert/strict'
import { createSnapshotCache } from './snapshot-cache'

async function main() {
  let time = 0
  let calls = 0
  const get = createSnapshotCache(async (key) => {
    calls++
    return key === 'missing' ? null : `${key}:${calls}`
  }, { ttlMs: 3, maxEntries: 2, now: () => time })

  const burst = await Promise.all(Array.from({ length: 100 }, () => get('a')))
  assert.equal(calls, 1, 'a burst must share one database read')
  assert.ok(burst.every((value) => value === 'a:1'))
  time = 2
  assert.equal(await get('a'), 'a:1')
  time = 3
  assert.equal(await get('a'), 'a:2', 'expired display data must refresh')
  await get('missing')
  await get('missing')
  assert.equal(calls, 3, 'unknown slugs are also cached')
  await get('b')
  await get('a')
  assert.equal(calls, 5, 'oldest entry must be evicted at the capacity limit')

  let attempts = 0
  const retry = createSnapshotCache(async () => {
    if (++attempts === 1) throw new Error('database unavailable')
    return 'recovered'
  })
  const failures = await Promise.allSettled([retry('x'), retry('x')])
  assert.ok(failures.every((result) => result.status === 'rejected'))
  assert.equal(await retry('x'), 'recovered', 'failed reads must not poison cache')
  assert.equal(attempts, 2)
  console.log('snapshot-cache: concurrency, expiry, negative cache, eviction and recovery passed')
}

void main()
