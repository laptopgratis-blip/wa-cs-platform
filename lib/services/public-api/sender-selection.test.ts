// Uji penguncian sesi pengirim API publik. Jalankan lewat `npm test`.
import assert from 'node:assert/strict'

import { applySessionPin, writeSenderIntoBody } from './sender-selection'

const A = { sessionId: 'sess-a' }
const B = { sessionId: 'sess-b' }
const ALL = [A, B]

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

console.log('public-api/sender-selection: applySessionPin')

check('tanpa session_id → daftar utuh', () => {
  assert.deepEqual(applySessionPin(ALL, undefined, false), ALL)
})

check('tanpa session_id tapi strict → tetap utuh (tidak ada yang dikunci)', () => {
  // strict_session sendirian tidak berarti apa-apa; harus ada sesi tujuannya.
  assert.deepEqual(applySessionPin(ALL, undefined, true), ALL)
})

check('session_id tanpa strict → daftar utuh (failover tetap boleh)', () => {
  assert.deepEqual(applySessionPin(ALL, 'sess-a', false), ALL)
})

check('session_id + strict → hanya sesi itu', () => {
  assert.deepEqual(applySessionPin(ALL, 'sess-a', true), [A])
})

check('strict ke sesi yang tidak ada di kandidat → KOSONG', () => {
  // Kasus penting: sesi ada di akun user tapi belum CONNECTED, jadi tidak
  // masuk kandidat. Pemanggil harus balas 409 session_unavailable, bukan
  // "tidak ada sesi terhubung".
  assert.deepEqual(applySessionPin(ALL, 'sess-c', true), [])
})

check('tidak memutasi array masukan', () => {
  const input = [A, B]
  applySessionPin(input, 'sess-a', true)
  assert.deepEqual(input, [A, B])
})

console.log('\npublic-api/sender-selection: writeSenderIntoBody')

const BASE = JSON.stringify(
  { phone_number: '628123456789', content: 'Halo', session_id: null },
  null,
  2,
)

check('pilih sesi → session_id terisi, strict_session tidak ditulis', () => {
  const out = JSON.parse(writeSenderIntoBody(BASE, 'sess-a', false))
  assert.equal(out.session_id, 'sess-a')
  assert.equal('strict_session' in out, false)
  // field lain tidak boleh hilang
  assert.equal(out.phone_number, '628123456789')
  assert.equal(out.content, 'Halo')
})

check('pilih sesi + strict → strict_session: true', () => {
  const out = JSON.parse(writeSenderIntoBody(BASE, 'sess-a', true))
  assert.equal(out.session_id, 'sess-a')
  assert.equal(out.strict_session, true)
})

check('kembali ke Otomatis → session_id null & strict_session dibuang', () => {
  const withPin = writeSenderIntoBody(BASE, 'sess-a', true)
  const out = JSON.parse(writeSenderIntoBody(withPin, null, true))
  assert.equal(out.session_id, null)
  assert.equal('strict_session' in out, false)
})

check('body JSON tidak valid → dikembalikan apa adanya (jangan buang ketikan)', () => {
  const typing = '{ "phone_number": "628'
  assert.equal(writeSenderIntoBody(typing, 'sess-a', true), typing)
})

check('body kosong → tetap menghasilkan JSON valid', () => {
  const out = JSON.parse(writeSenderIntoBody('', 'sess-a', false))
  assert.deepEqual(out, { session_id: 'sess-a' })
})

check('body berupa array → ditolak, kembalikan apa adanya', () => {
  const arr = '[1,2]'
  assert.equal(writeSenderIntoBody(arr, 'sess-a', false), arr)
})

console.log(`\npublic-api/sender-selection: ${passed} pemeriksaan lolos`)
