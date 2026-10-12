// Uji orderUpdateSchema (PATCH /api/orders/[id]). Jalankan lewat `npm test`.
// Fokus: field edit data pelanggan — kode pos baru, dan field lama tidak
// berubah perilaku.
import assert from 'node:assert/strict'

import { orderUpdateSchema } from './order'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

function firstError(input: unknown): string | null {
  const r = orderUpdateSchema.safeParse(input)
  return r.success ? null : (r.error.issues[0]?.message ?? '')
}

console.log('validations/order: orderUpdateSchema')

check('{} → objek kosong (tanpa default tersisip)', () => {
  const r = orderUpdateSchema.safeParse({})
  assert.equal(r.success, true)
  assert.deepEqual(r.success && r.data, {})
})

check('PATCH status lama tetap lolos apa adanya', () => {
  const body = {
    paymentStatus: 'PAID',
    deliveryStatus: 'SHIPPED',
    paymentMethod: 'TRANSFER',
    trackingNumber: 'JNE123',
    notes: null,
  }
  const r = orderUpdateSchema.safeParse(body)
  assert.equal(r.success, true)
  assert.deepEqual(r.success && r.data, body)
})

check('shippingPostalCode 5 digit → lolos (di-trim)', () => {
  const r = orderUpdateSchema.safeParse({ shippingPostalCode: ' 40123 ' })
  assert.equal(r.success, true)
  assert.deepEqual(r.success && r.data, { shippingPostalCode: '40123' })
})

check('shippingPostalCode null / kosong → lolos (dikosongkan)', () => {
  const nul = orderUpdateSchema.safeParse({ shippingPostalCode: null })
  assert.deepEqual(nul.success && nul.data, { shippingPostalCode: null })
  const empty = orderUpdateSchema.safeParse({ shippingPostalCode: '  ' })
  assert.deepEqual(empty.success && empty.data, { shippingPostalCode: '' })
})

check('shippingPostalCode bukan 5 digit → pesan Indonesia', () => {
  for (const v of ['4012', '401234', '4012a', '40 12']) {
    assert.equal(
      firstError({ shippingPostalCode: v }),
      'Kode pos harus 5 digit angka',
      v,
    )
  }
})

check('shippingPostalCode bukan string → ditolak', () => {
  assert.notEqual(firstError({ shippingPostalCode: 40123 }), null)
})

check('customerPhone tetap string mentah (normalisasi di route)', () => {
  const r = orderUpdateSchema.safeParse({ customerPhone: ' 0812-3456-7890 ' })
  assert.equal(r.success, true)
  assert.deepEqual(r.success && r.data, { customerPhone: '0812-3456-7890' })
})

check('customerPhone < 8 atau > 20 karakter → ditolak', () => {
  assert.notEqual(firstError({ customerPhone: '0812' }), null)
  assert.notEqual(firstError({ customerPhone: '0'.repeat(21) }), null)
})

check('customerName & customerAddress: batas lama tidak berubah', () => {
  assert.notEqual(firstError({ customerName: 'A' }), null)
  assert.equal(firstError({ customerName: 'Al' }), null)
  assert.equal(firstError({ customerAddress: null }), null)
  assert.equal(firstError({ customerAddress: 'a'.repeat(1000) }), null)
  assert.notEqual(firstError({ customerAddress: 'a'.repeat(1001) }), null)
})

check('field area (kota/kecamatan) dibuang — tidak bisa diedit', () => {
  const r = orderUpdateSchema.safeParse({
    shippingCityName: 'Bandung',
    shippingDistrictName: 'Coblong',
    shippingProvinceName: 'Jawa Barat',
    customerName: 'Budi',
  })
  assert.equal(r.success, true)
  assert.deepEqual(r.success && r.data, { customerName: 'Budi' })
})

console.log(`\n${passed} uji lulus`)
