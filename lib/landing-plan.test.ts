// Uji teks paket Sistem Order di landing publik. Jalankan lewat `npm test`.
import assert from 'node:assert/strict'

import {
  ORDER_SYSTEM_PLAN_FALLBACK,
  orderSystemPlanName,
  orderSystemPriceText,
} from './landing-plan'

const popular = { name: 'Popular', priceMonthly: 79_000 }

// Nama paket ikut DB — kalau admin pindah flag ke paket lain, copy ikut.
assert.equal(orderSystemPlanName(popular), 'Popular')
assert.equal(orderSystemPlanName(null), ORDER_SYSTEM_PLAN_FALLBACK)

// Harga ditulis "setara" + bulanan, format rupiah id-ID tanpa desimal.
const price = orderSystemPriceText(popular)
assert.ok(price, 'harga harus ada kalau paket ada')
assert.match(price, /^setara Rp\s?79\.000\/bulan$/)

// Tanpa paket (DB kosong/gagal) → tidak menampilkan angka karangan.
assert.equal(orderSystemPriceText(null), null)
// Harga 0 = paket belum dijual → jangan tampil "Rp 0".
assert.equal(orderSystemPriceText({ name: 'Popular', priceMonthly: 0 }), null)

console.log('landing-plan ok')
