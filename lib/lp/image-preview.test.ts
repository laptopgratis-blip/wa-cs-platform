// Uji aturan preview 2 baris grid inline ImageManager. Jalankan lewat `npm test`.
import assert from 'node:assert/strict'

import {
  INLINE_PREVIEW_MAX,
  previewTileClass,
  previewToggleClass,
} from './image-preview'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

check('maks render = 2 baris × 5 kolom (container terlebar)', () => {
  assert.equal(INLINE_PREVIEW_MAX, 10)
})

check('4 tile pertama selalu tampil (2 baris × 2 kolom HP)', () => {
  for (const i of [0, 1, 2, 3]) assert.equal(previewTileClass(i), '')
})

check('tile ke-5..6 baru tampil di container 3 kolom (@md)', () => {
  assert.equal(previewTileClass(4), 'hidden @md:flex')
  assert.equal(previewTileClass(5), 'hidden @md:flex')
})

check('tile ke-7..8 di 4 kolom (@xl), ke-9..10 di 5 kolom (@3xl)', () => {
  assert.equal(previewTileClass(6), 'hidden @xl:flex')
  assert.equal(previewTileClass(7), 'hidden @xl:flex')
  assert.equal(previewTileClass(8), 'hidden @3xl:flex')
  assert.equal(previewTileClass(9), 'hidden @3xl:flex')
})

check('≤4 gambar → tombol "Tampilkan semua" tidak perlu', () => {
  assert.equal(previewToggleClass(0), null)
  assert.equal(previewToggleClass(4), null)
})

check('tombol disembunyikan di container yang sudah memuat semua', () => {
  assert.equal(previewToggleClass(5), '@md:hidden')
  assert.equal(previewToggleClass(6), '@md:hidden')
  assert.equal(previewToggleClass(7), '@xl:hidden')
  assert.equal(previewToggleClass(8), '@xl:hidden')
  assert.equal(previewToggleClass(9), '@3xl:hidden')
  assert.equal(previewToggleClass(10), '@3xl:hidden')
})

check('>10 gambar → tombol selalu tampil', () => {
  assert.equal(previewToggleClass(11), '')
  assert.equal(previewToggleClass(129), '')
})

console.log(`lp/image-preview: ${passed} lulus`)
