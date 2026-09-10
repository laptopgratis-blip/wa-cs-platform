// Test lib/validations/public-message.ts — jalankan: npx tsx lib/validations/public-message.test.ts
import assert from 'node:assert/strict'

import { publicSendTextSchema } from './public-message'

let passed = 0
function ok(label: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  ok  ${label}`)
}

console.log('public-message: publicSendTextSchema')

// ── Regresi perilaku lama (teks) ──────────────────────────────

ok('teks-saja valid — perilaku lama tidak berubah', () => {
  const r = publicSendTextSchema.safeParse({
    phone_number: '+62 812-3456-7890',
    content: 'Halo dari API',
  })
  assert.ok(r.success)
  assert.equal(r.data.phone_number, '6281234567890')
  assert.equal(r.data.content, 'Halo dari API')
  assert.equal(r.data.image_url ?? null, null)
})

ok('teks kosong tanpa gambar → "Isi pesan wajib"', () => {
  const r = publicSendTextSchema.safeParse({
    phone_number: '628123456789',
    content: '   ',
  })
  assert.ok(!r.success)
  assert.match(r.error.issues[0]?.message ?? '', /Isi pesan wajib/)
})

ok('tanpa content sama sekali & tanpa gambar → ditolak', () => {
  const r = publicSendTextSchema.safeParse({ phone_number: '628123456789' })
  assert.ok(!r.success)
})

ok('teks >4096 karakter → ditolak', () => {
  const r = publicSendTextSchema.safeParse({
    phone_number: '628123456789',
    content: 'x'.repeat(4097),
  })
  assert.ok(!r.success)
})

ok('session_id null eksplisit tetap diterima', () => {
  const r = publicSendTextSchema.safeParse({
    phone_number: '628123456789',
    content: 'Halo',
    session_id: null,
  })
  assert.ok(r.success)
})

// ── Gambar (fitur baru) ───────────────────────────────────────

ok('image_url tanpa content → valid (gambar tanpa caption)', () => {
  const r = publicSendTextSchema.safeParse({
    phone_number: '628123456789',
    image_url: 'https://cdn.contoh.com/promo.jpg',
  })
  assert.ok(r.success)
  assert.equal(r.data.image_url, 'https://cdn.contoh.com/promo.jpg')
})

ok('image_url + caption pendek → valid', () => {
  const r = publicSendTextSchema.safeParse({
    phone_number: '628123456789',
    content: 'Promo September!',
    image_url: 'https://cdn.contoh.com/promo.jpg',
  })
  assert.ok(r.success)
  assert.equal(r.data.content, 'Promo September!')
})

ok('caption >1024 karakter saat ada gambar → ditolak', () => {
  const r = publicSendTextSchema.safeParse({
    phone_number: '628123456789',
    content: 'x'.repeat(1025),
    image_url: 'https://cdn.contoh.com/promo.jpg',
  })
  assert.ok(!r.success)
  assert.match(r.error.issues[0]?.message ?? '', /[Cc]aption/)
})

ok('image_url bukan URL → ditolak', () => {
  const r = publicSendTextSchema.safeParse({
    phone_number: '628123456789',
    image_url: 'bukan-url',
  })
  assert.ok(!r.success)
})

ok('image_url skema selain http(s) → ditolak', () => {
  const r = publicSendTextSchema.safeParse({
    phone_number: '628123456789',
    image_url: 'ftp://cdn.contoh.com/promo.jpg',
  })
  assert.ok(!r.success)
})

console.log(`\npublic-message: ${passed} pemeriksaan lolos`)
