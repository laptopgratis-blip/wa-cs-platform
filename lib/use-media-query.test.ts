// Uji createMediaQueryStore. Jalankan lewat `npm test`.
import assert from 'node:assert/strict'

import { createMediaQueryStore, LG_UP_QUERY } from './use-media-query'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

// Stub matchMedia minimal — test jalan di Node tanpa DOM.
type Listener = () => void
interface FakeMql {
  matches: boolean
  listeners: Set<Listener>
  addEventListener: (t: 'change', l: Listener) => void
  removeEventListener: (t: 'change', l: Listener) => void
}

function installMatchMedia(initial: boolean): {
  mql: FakeMql
  queries: string[]
  setMatches: (v: boolean) => void
} {
  const queries: string[] = []
  const mql: FakeMql = {
    matches: initial,
    listeners: new Set(),
    addEventListener: (_t, l) => mql.listeners.add(l),
    removeEventListener: (_t, l) => mql.listeners.delete(l),
  }
  Object.defineProperty(globalThis, 'window', {
    value: {
      matchMedia: (q: string) => {
        queries.push(q)
        return mql
      },
    },
    configurable: true,
    writable: true,
  })
  return {
    mql,
    queries,
    setMatches: (v) => {
      mql.matches = v
      mql.listeners.forEach((l) => l())
    },
  }
}

check('LG_UP_QUERY = breakpoint lg Tailwind v4 (64rem)', () => {
  assert.equal(LG_UP_QUERY, '(min-width: 64rem)')
})

check('getSnapshot membaca matches dari query yang benar', () => {
  const { queries } = installMatchMedia(true)
  const store = createMediaQueryStore(LG_UP_QUERY)
  assert.equal(store.getSnapshot(), true)
  assert.ok(queries.every((q) => q === LG_UP_QUERY))
})

check('getServerSnapshot selalu false (SSR tak tahu lebar layar)', () => {
  installMatchMedia(true)
  assert.equal(createMediaQueryStore(LG_UP_QUERY).getServerSnapshot(), false)
})

check('subscribe memanggil callback saat breakpoint dilewati', () => {
  const { setMatches } = installMatchMedia(false)
  const store = createMediaQueryStore(LG_UP_QUERY)
  let calls = 0
  const unsubscribe = store.subscribe(() => {
    calls += 1
  })
  setMatches(true)
  assert.equal(calls, 1)
  assert.equal(store.getSnapshot(), true)
  unsubscribe()
})

check('unsubscribe melepas listener', () => {
  const { mql, setMatches } = installMatchMedia(false)
  const store = createMediaQueryStore(LG_UP_QUERY)
  let calls = 0
  const unsubscribe = store.subscribe(() => {
    calls += 1
  })
  unsubscribe()
  assert.equal(mql.listeners.size, 0)
  setMatches(true)
  assert.equal(calls, 0)
})

console.log(`use-media-query: ${passed} lulus`)
