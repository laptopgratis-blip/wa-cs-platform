// Uji urutan "kontak terbaru" lintas sesi. Jalankan lewat `npm test`.
import assert from 'node:assert/strict'

import { CONTACT_RECENCY_ORDER } from './recency'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

console.log('contacts/recency')

check('lastMessageAt desc dengan NULL di akhir (kontak impor tanpa percakapan kalah)', () => {
  // Postgres: DESC default NULLS FIRST — tanpa `nulls: last` baris impor
  // (lastMessageAt NULL) menang atas percakapan nyata di sesi lain.
  assert.deepEqual(CONTACT_RECENCY_ORDER[0], { lastMessageAt: { sort: 'desc', nulls: 'last' } })
})

check('tie-break deterministik by updatedAt desc', () => {
  assert.deepEqual(CONTACT_RECENCY_ORDER[1], { updatedAt: 'desc' })
  assert.equal(CONTACT_RECENCY_ORDER.length, 2)
})

console.log(`contacts/recency: ${passed} lulus`)
