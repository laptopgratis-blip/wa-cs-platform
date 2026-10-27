// Uji payload pesan free-form Cloud API (teks / gambar / dokumen).
// Jalankan lewat `npm test`.
import assert from 'node:assert/strict'

import { freeformMessageContent } from './freeform-payload'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

console.log('waba/freeform-payload: freeformMessageContent')

check('teks biasa', () => {
  assert.deepEqual(freeformMessageContent('Halo kak'), {
    type: 'text',
    text: { body: 'Halo kak' },
  })
})

check('gambar by media id + caption', () => {
  assert.deepEqual(
    freeformMessageContent('Foto testimoni', { kind: 'image', id: 'm1' }),
    {
      type: 'image',
      image: { id: 'm1', caption: 'Foto testimoni' },
    },
  )
})

check('gambar by link tanpa caption saat konten kosong', () => {
  assert.deepEqual(
    freeformMessageContent('', { kind: 'image', link: 'https://x.id/a.jpg' }),
    {
      type: 'image',
      image: { link: 'https://x.id/a.jpg' },
    },
  )
})

check('dokumen by media id: filename + caption', () => {
  assert.deepEqual(
    freeformMessageContent('Katalog terbaru', {
      kind: 'document',
      id: 'm2',
      filename: 'Katalog.pdf',
    }),
    {
      type: 'document',
      document: {
        id: 'm2',
        filename: 'Katalog.pdf',
        caption: 'Katalog terbaru',
      },
    },
  )
})

check('dokumen tanpa caption saat konten kosong', () => {
  assert.deepEqual(
    freeformMessageContent('', {
      kind: 'document',
      id: 'm3',
      filename: 'Harga.xlsx',
    }),
    { type: 'document', document: { id: 'm3', filename: 'Harga.xlsx' } },
  )
})

console.log(`\nwaba/freeform-payload: ${passed} pemeriksaan lolos`)
