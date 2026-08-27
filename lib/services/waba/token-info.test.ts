// Uji keputusan blokir sinkronisasi coexistence. Jalankan lewat `npm test`.
import assert from 'node:assert/strict'

import { coexSyncBlockedReason } from './token-info'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

console.log('waba/token-info: coexSyncBlockedReason')

check('USER (hasil Embedded Signup) → boleh sync', () => {
  assert.equal(coexSyncBlockedReason('USER'), null)
})

check('SYSTEM_USER (Token Manual) → DIBLOKIR dengan alasan', () => {
  const r = coexSyncBlockedReason('SYSTEM_USER')
  assert.notEqual(r, null)
  assert.match(r ?? '', /Embedded Signup/i)
  assert.match(r ?? '', /System User/i)
})

check('tipe tidak diketahui (debug_token gagal) → BOLEH, jangan blokir', () => {
  // Lebih baik dicoba lalu ditolak Meta daripada memblokir sesi yang sah
  // hanya karena pemeriksaan tambahan tidak bisa dilakukan.
  assert.equal(coexSyncBlockedReason(undefined), null)
})

check('tipe lain (PAGE/APP) → boleh, bukan urusan pemeriksaan ini', () => {
  assert.equal(coexSyncBlockedReason('PAGE'), null)
  assert.equal(coexSyncBlockedReason('APP'), null)
})

console.log(`\nwaba/token-info: ${passed} pemeriksaan lolos`)
