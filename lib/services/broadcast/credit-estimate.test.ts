// Uji estimasi Kredit Pesan broadcast Cloud API. Jalankan lewat `npm test`.
import assert from 'node:assert/strict'

import { estimateBroadcastCreditRp } from './credit-estimate'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

console.log('broadcast/credit-estimate')

check('billing kredit NONAKTIF → estimasi 0 (Meta menagih seller langsung)', () => {
  assert.equal(
    estimateBroadcastCreditRp({
      billingEnabled: false,
      isPlatform: false,
      pendingCount: 1,
      ratePerMessageRp: 393,
    }),
    0,
  )
})

check('billing kredit NONAKTIF + banyak penerima → tetap 0', () => {
  assert.equal(
    estimateBroadcastCreditRp({
      billingEnabled: false,
      isPlatform: false,
      pendingCount: 5000,
      ratePerMessageRp: 657,
    }),
    0,
  )
})

check('billing aktif → pendingCount × tarif', () => {
  assert.equal(
    estimateBroadcastCreditRp({
      billingEnabled: true,
      isPlatform: false,
      pendingCount: 3,
      ratePerMessageRp: 393,
    }),
    1179,
  )
})

check('sesi platform (admin) tidak pernah ditagih', () => {
  assert.equal(
    estimateBroadcastCreditRp({
      billingEnabled: true,
      isPlatform: true,
      pendingCount: 10,
      ratePerMessageRp: 393,
    }),
    0,
  )
})

check('input tak wajar (negatif / NaN) tidak menghasilkan estimasi negatif', () => {
  assert.equal(
    estimateBroadcastCreditRp({
      billingEnabled: true,
      isPlatform: false,
      pendingCount: -2,
      ratePerMessageRp: 393,
    }),
    0,
  )
  assert.equal(
    estimateBroadcastCreditRp({
      billingEnabled: true,
      isPlatform: false,
      pendingCount: 2,
      ratePerMessageRp: Number.NaN,
    }),
    0,
  )
})

console.log(`broadcast/credit-estimate: ${passed} ok`)
