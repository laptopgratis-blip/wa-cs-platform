// Uji schema follow-up template. Jalankan lewat `npm test`.
// Fokus: PATCH parsial TIDAK boleh membawa default dari schema create
// (bug: toggle {isActive:false} me-reset delayDays/scope/order).
import assert from 'node:assert/strict'

import {
  followupTemplateCreateSchema,
  followupTemplateUpdateSchema,
} from './followup'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

console.log('validations/followup: create & update schema')

check('update {isActive:false} → tepat {isActive:false} (tanpa default)', () => {
  const r = followupTemplateUpdateSchema.safeParse({ isActive: false })
  assert.equal(r.success, true)
  assert.deepEqual(r.success && r.data, { isActive: false })
})

check('update {} → objek kosong', () => {
  const r = followupTemplateUpdateSchema.safeParse({})
  assert.equal(r.success, true)
  assert.deepEqual(r.success && r.data, {})
})

check('update {metaParamMap:null} → tepat {metaParamMap:null}', () => {
  const r = followupTemplateUpdateSchema.safeParse({ metaParamMap: null })
  assert.equal(r.success, true)
  assert.deepEqual(r.success && r.data, { metaParamMap: null })
})

check('update {metaTemplateId:null, metaParamMap:["{nama}"]} dipertahankan', () => {
  const r = followupTemplateUpdateSchema.safeParse({
    metaTemplateId: null,
    metaParamMap: ['{nama}'],
  })
  assert.equal(r.success, true)
  assert.deepEqual(r.success && r.data, {
    metaTemplateId: null,
    metaParamMap: ['{nama}'],
  })
})

check('update menolak key asing (strict)', () => {
  const r = followupTemplateUpdateSchema.safeParse({ isActive: true, foo: 1 })
  assert.equal(r.success, false)
})

check('update delayDays di luar batas ditolak', () => {
  assert.equal(followupTemplateUpdateSchema.safeParse({ delayDays: 31 }).success, false)
})

check('create tetap mendapat default', () => {
  const r = followupTemplateCreateSchema.safeParse({
    name: 'Ucapan',
    trigger: 'ORDER_CREATED',
    message: 'Halo {nama}',
  })
  assert.equal(r.success, true)
  if (!r.success) return
  assert.equal(r.data.delayDays, 0)
  assert.equal(r.data.isActive, true)
  assert.equal(r.data.scope, 'GLOBAL')
  assert.equal(r.data.order, 0)
  assert.equal(r.data.paymentMethod, null)
})

check('create wajib name/trigger/message', () => {
  assert.equal(followupTemplateCreateSchema.safeParse({ name: 'Ab' }).success, false)
})

console.log(`validations/followup: ${passed} ok`)
