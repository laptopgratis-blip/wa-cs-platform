// Uji skema produk — fokus field csSessionId (CS WhatsApp per produk).
// Jalankan lewat `npm test`.
import assert from 'node:assert/strict'

import { productCreateSchema, productUpdateSchema } from './product'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const BASE_CREATE = { name: 'Kopi Arabika', price: 50_000, weightGrams: 250 }

console.log('validations/product: csSessionId')

check('create: csSessionId tidak dikirim → lolos, tetap undefined', () => {
  const r = productCreateSchema.safeParse(BASE_CREATE)
  assert.equal(r.success, true)
  if (r.success) assert.equal(r.data.csSessionId, undefined)
})

check('create: csSessionId null → lolos (ikuti nomor utama)', () => {
  const r = productCreateSchema.safeParse({ ...BASE_CREATE, csSessionId: null })
  assert.equal(r.success, true)
  if (r.success) assert.equal(r.data.csSessionId, null)
})

check('create: csSessionId string → lolos apa adanya', () => {
  const r = productCreateSchema.safeParse({
    ...BASE_CREATE,
    csSessionId: 'cmsess123',
  })
  assert.equal(r.success, true)
  if (r.success) assert.equal(r.data.csSessionId, 'cmsess123')
})

check('create: csSessionId string kosong → ditolak', () => {
  const r = productCreateSchema.safeParse({ ...BASE_CREATE, csSessionId: '' })
  assert.equal(r.success, false)
})

check('create: csSessionId bukan string → ditolak', () => {
  const r = productCreateSchema.safeParse({ ...BASE_CREATE, csSessionId: 123 })
  assert.equal(r.success, false)
})

check('update: payload tanpa csSessionId → lolos, field tidak muncul', () => {
  const r = productUpdateSchema.safeParse({ name: 'Kopi Robusta' })
  assert.equal(r.success, true)
  if (r.success) assert.equal('csSessionId' in r.data, false)
})

check('update: csSessionId null → lolos (lepas CS produk)', () => {
  const r = productUpdateSchema.safeParse({ csSessionId: null })
  assert.equal(r.success, true)
  if (r.success) assert.equal(r.data.csSessionId, null)
})

check('update: csSessionId string → lolos', () => {
  const r = productUpdateSchema.safeParse({ csSessionId: 'cmsess123' })
  assert.equal(r.success, true)
  if (r.success) assert.equal(r.data.csSessionId, 'cmsess123')
})

check('update: csSessionId string kosong → ditolak', () => {
  const r = productUpdateSchema.safeParse({ csSessionId: '' })
  assert.equal(r.success, false)
})

console.log(`validations/product: ${passed} ok`)
