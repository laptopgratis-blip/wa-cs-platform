// Uji schema pembuatan broadcast — fokus target "Semua kontak di nomor ini".
// Jalankan lewat `npm test`.
import assert from 'node:assert/strict'

import { broadcastCreateSchema } from './broadcast'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const base = { name: 'Promo Oktober', waSessionId: 'wa_1', message: 'Halo {nama}' }

console.log('validations/broadcast: target')

check('tag saja → valid, targetAll default false', () => {
  const r = broadcastCreateSchema.safeParse({ ...base, targetTags: ['vip'] })
  assert.equal(r.success, true)
  assert.equal(r.success && r.data.targetAll, false)
  assert.deepEqual(r.success && r.data.targetTags, ['vip'])
})

check('tanpa tag, stage, maupun targetAll → ditolak', () => {
  const r = broadcastCreateSchema.safeParse(base)
  assert.equal(r.success, false)
  assert.match(r.success ? '' : (r.error.issues[0]?.message ?? ''), /Pilih target/)
})

check('targetAll tanpa tag/stage → valid, target kosong (= semua kontak)', () => {
  const r = broadcastCreateSchema.safeParse({ ...base, targetAll: true })
  assert.equal(r.success, true)
  assert.equal(r.success && r.data.targetAll, true)
  assert.deepEqual(r.success && r.data.targetTags, [])
  assert.deepEqual(r.success && r.data.targetStages, [])
})

check('targetAll + tag/stage → tag & stage diabaikan (disimpan kosong)', () => {
  const r = broadcastCreateSchema.safeParse({
    ...base,
    targetAll: true,
    targetTags: ['vip'],
    targetStages: ['NEW'],
  })
  assert.equal(r.success, true)
  assert.deepEqual(r.success && r.data.targetTags, [])
  assert.deepEqual(r.success && r.data.targetStages, [])
})

check('targetAll false eksplisit + stage → valid seperti biasa', () => {
  const r = broadcastCreateSchema.safeParse({ ...base, targetAll: false, targetStages: ['PROSPECT'] })
  assert.equal(r.success, true)
  assert.deepEqual(r.success && r.data.targetStages, ['PROSPECT'])
})

check('pesan kosong tanpa template tetap ditolak', () => {
  const r = broadcastCreateSchema.safeParse({ ...base, message: '  ', targetAll: true })
  assert.equal(r.success, false)
})

console.log(`validations/broadcast: ${passed} lulus`)
