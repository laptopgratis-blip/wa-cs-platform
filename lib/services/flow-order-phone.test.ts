// Uji resolveFlowOrderPhone & isFollowUpDeliverablePhone. Jalankan lewat `npm test`.
import assert from 'node:assert/strict'

import {
  isFollowUpDeliverablePhone,
  resolveFlowOrderPhone,
} from './flow-order-phone'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

console.log('flow-order-phone: resolveFlowOrderPhone')

check('nomor ketikan 08xx dinormalisasi ke 628xx (format blacklist/JID)', () => {
  assert.equal(resolveFlowOrderPhone('081234567890', '6289999999999'), '6281234567890')
  assert.equal(resolveFlowOrderPhone('0812-3456-7890', null), '6281234567890')
  assert.equal(resolveFlowOrderPhone('+62 812 3456 7890', null), '6281234567890')
  assert.equal(resolveFlowOrderPhone('81234567890', null), '6281234567890')
  assert.equal(resolveFlowOrderPhone('6281234567890', null), '6281234567890')
})

check('nomor ketikan non-Indonesia/tak valid disimpan apa adanya (digit)', () => {
  // Data kurir jangan hilang — seller tetap lihat yang diketik customer.
  assert.equal(resolveFlowOrderPhone('60123456789', '6281'), '60123456789')
  assert.equal(resolveFlowOrderPhone('0211234567', null), '0211234567')
})

check('tanpa nomor ketikan → fallback nomor kontak WA', () => {
  assert.equal(resolveFlowOrderPhone(undefined, '6281234567890'), '6281234567890')
  assert.equal(resolveFlowOrderPhone('', '+6281234567890'), '6281234567890')
  assert.equal(resolveFlowOrderPhone('  ', '081234567890'), '6281234567890')
})

check('kontak LID / JID penuh dipertahankan apa adanya', () => {
  assert.equal(resolveFlowOrderPhone(undefined, '123456789012345@lid'), '123456789012345@lid')
})

check('tanpa nomor sama sekali → string kosong', () => {
  assert.equal(resolveFlowOrderPhone(undefined, null), '')
  assert.equal(resolveFlowOrderPhone(null, ''), '')
})

console.log('flow-order-phone: isFollowUpDeliverablePhone')

check('nomor internasional digit tanpa awalan 0 → bisa dikirimi', () => {
  assert.equal(isFollowUpDeliverablePhone('6281234567890'), true)
  assert.equal(isFollowUpDeliverablePhone('60123456789'), true)
})

check('JID penuh (LID) → bisa dikirimi (wa-service pakai apa adanya)', () => {
  assert.equal(isFollowUpDeliverablePhone('123456789012345@lid'), true)
})

check('kosong / awalan 0 / ber-plus / terlalu pendek → tidak', () => {
  assert.equal(isFollowUpDeliverablePhone(''), false)
  assert.equal(isFollowUpDeliverablePhone('081234567890'), false)
  assert.equal(isFollowUpDeliverablePhone('0211234567'), false)
  assert.equal(isFollowUpDeliverablePhone('+6281234567890'), false)
  assert.equal(isFollowUpDeliverablePhone('62812'), false)
  assert.equal(isFollowUpDeliverablePhone('6281234567890123'), false)
})

console.log(`\n${passed} test lulus`)
