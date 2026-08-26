// Uji guard event socket basi. Jalankan: npm run test (wa-service).
// Gaya sama dengan test lain di repo: tsx + node:assert, tanpa framework.
import assert from 'node:assert/strict'

import { isStaleSocketEvent } from './socket-guard.js'

type FakeSocket = { id: string }
interface FakeEntry {
  socket: FakeSocket | null
}

const sockA: FakeSocket = { id: 'A' }
const sockB: FakeSocket = { id: 'B' }

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

console.log('socket-guard: isStaleSocketEvent')

check('event dari socket aktif milik entry terdaftar = SAH', () => {
  const entry: FakeEntry = { socket: sockA }
  assert.equal(isStaleSocketEvent(entry, entry, sockA), false)
})

check('entry sudah dihapus dari map (undefined) = BASI', () => {
  // Skenario disconnect(wipe): sessions.delete() jalan, lalu close telat tiba.
  const entry: FakeEntry = { socket: sockA }
  assert.equal(isStaleSocketEvent(undefined, entry, sockA), true)
})

check('entry diganti objek lain di map = BASI', () => {
  // Skenario re-pair: entry lama dibuang, doConnect membuat entry baru.
  const oldEntry: FakeEntry = { socket: sockA }
  const newEntry: FakeEntry = { socket: sockB }
  assert.equal(isStaleSocketEvent(newEntry, oldEntry, sockA), true)
})

check('entry sama tapi socket sudah diganti socket baru = BASI', () => {
  // Skenario reconnect otomatis: entry dipakai ulang, socket B menggantikan A.
  const entry: FakeEntry = { socket: sockB }
  assert.equal(isStaleSocketEvent(entry, entry, sockA), true)
})

check('entry sama tapi socket sudah null (pasca close) = BASI', () => {
  // Cegah close ganda dari socket yang sama diproses dua kali.
  const entry: FakeEntry = { socket: null }
  assert.equal(isStaleSocketEvent(entry, entry, sockA), true)
})

console.log(`\nsocket-guard: ${passed} pemeriksaan lolos`)
