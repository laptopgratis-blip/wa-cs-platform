// Uji pengelompokan opsi filter nomor. Jalankan lewat `npm test`.
import assert from 'node:assert/strict'

import { buildSenderOptions, type SessionRow } from './sender-options'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const row = (o: Partial<SessionRow>): SessionRow => ({
  displayName: null,
  phoneNumber: null,
  provider: 'BAILEYS',
  status: 'DISCONNECTED',
  contactCount: 0,
  ...o,
})

console.log('inbox/sender-options: buildSenderOptions')

check('sesi tanpa nomor dibuang', () => {
  assert.deepEqual(buildSenderOptions([row({ phoneNumber: null, status: 'CONNECTED' })]), [])
})

check('sesi DISCONNECTED tanpa kontak dibuang (sampah pairing)', () => {
  assert.deepEqual(buildSenderOptions([row({ phoneNumber: '628111' })]), [])
})

check('sesi DISCONNECTED yang MASIH punya kontak tetap masuk', () => {
  // Kasus nyata staging: Cleanoz disconnect tapi memegang 914 kontak.
  const out = buildSenderOptions([row({ phoneNumber: '628111', contactCount: 914 })])
  assert.equal(out.length, 1)
  assert.equal(out[0]?.isConnected, false)
})

check('banyak sesi untuk satu nomor → satu opsi saja', () => {
  const out = buildSenderOptions([
    row({ phoneNumber: '628111', displayName: 'Lama', contactCount: 5 }),
    row({ phoneNumber: '628111', displayName: 'Lama2', contactCount: 3 }),
    row({ phoneNumber: '628111', displayName: 'Lama3', contactCount: 1 }),
  ])
  assert.equal(out.length, 1)
})

check('nama dari sesi CONNECTED menang atas nama lama', () => {
  const out = buildSenderOptions([
    row({ phoneNumber: '628111', displayName: 'Dhayu Fahmil Falah', contactCount: 1 }),
    row({ phoneNumber: '628111', displayName: 'Cleanoz', status: 'CONNECTED' }),
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0]?.displayName, 'Cleanoz')
  assert.equal(out[0]?.isConnected, true)
})

check('urutan terbalik pun nama CONNECTED tetap menang', () => {
  const out = buildSenderOptions([
    row({ phoneNumber: '628111', displayName: 'Cleanoz', status: 'CONNECTED' }),
    row({ phoneNumber: '628111', displayName: 'Dhayu Fahmil Falah', contactCount: 1 }),
  ])
  assert.equal(out[0]?.displayName, 'Cleanoz')
})

check('data staging nyata: 16 sesi → tepat 3 nomor', () => {
  const staging: SessionRow[] = [
    ...Array.from({ length: 5 }, () =>
      row({ phoneNumber: '6285161069355', displayName: 'Dhayu Fahmil Falah', provider: 'CLOUD_API' }),
    ),
    row({ phoneNumber: '6285161069355', displayName: 'Dhayu Fahmil Falah', provider: 'CLOUD_API', contactCount: 1 }),
    row({ phoneNumber: '6285161069355', displayName: 'Cleanoz', provider: 'CLOUD_API', contactCount: 914 }),
    ...Array.from({ length: 5 }, () => row({ phoneNumber: null })),
    row({ phoneNumber: '6282220651700' }),
    row({ phoneNumber: '6282220651700', displayName: 'Habib Almaula', status: 'CONNECTED', contactCount: 6 }),
    row({ phoneNumber: '6285161069355', displayName: 'Cleanoz', provider: 'CLOUD_API', status: 'CONNECTED', contactCount: 1 }),
    row({ phoneNumber: '6285172399936', displayName: 'cs zahra', provider: 'CLOUD_API', status: 'CONNECTED', contactCount: 3283 }),
  ]
  const out = buildSenderOptions(staging)
  assert.equal(out.length, 3)
  assert.deepEqual(
    out.map((o) => o.displayName).sort(),
    ['Cleanoz', 'Habib Almaula', 'cs zahra'],
  )
  // Semuanya harus tersambung — versi DISCONNECTED nomor yang sama tidak
  // boleh muncul sebagai opsi kedua.
  assert.equal(out.every((o) => o.isConnected), true)
})

console.log(`\ninbox/sender-options: ${passed} pemeriksaan lolos`)
