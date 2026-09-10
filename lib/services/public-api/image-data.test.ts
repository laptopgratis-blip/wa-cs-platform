// Test lib/services/public-api/image-data.ts — jalankan: npx tsx lib/services/public-api/image-data.test.ts
import assert from 'node:assert/strict'

import {
  MAX_IMAGE_BYTES,
  decodeImageBase64,
  sniffImageMime,
} from './image-data'

let passed = 0
function ok(label: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  ok  ${label}`)
}

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 ', 'ascii'),
])

console.log('image-data: decodeImageBase64 & sniffImageMime')

ok('JPEG base64 → decode + mime benar', () => {
  const r = decodeImageBase64(JPEG.toString('base64'))
  assert.ok(r.ok)
  assert.equal(r.image.mime, 'image/jpeg')
  assert.ok(r.image.buffer.equals(JPEG))
})

ok('PNG dengan prefix data URI → prefix dibuang, mime dari magic bytes', () => {
  const r = decodeImageBase64(`data:image/png;base64,${PNG.toString('base64')}`)
  assert.ok(r.ok)
  assert.equal(r.image.mime, 'image/png')
})

ok('WebP terdeteksi', () => {
  const r = decodeImageBase64(WEBP.toString('base64'))
  assert.ok(r.ok)
  assert.equal(r.image.mime, 'image/webp')
})

ok('prefix data URI bohong tidak dipercaya — magic bytes yang menentukan', () => {
  const r = decodeImageBase64(
    `data:image/png;base64,${JPEG.toString('base64')}`,
  )
  assert.ok(r.ok)
  assert.equal(r.image.mime, 'image/jpeg')
})

ok('whitespace/newline di tengah base64 ditoleransi', () => {
  const b64 = JPEG.toString('base64')
  const r = decodeImageBase64(`${b64.slice(0, 4)}\n${b64.slice(4)}`)
  assert.ok(r.ok)
})

ok('string kosong → ditolak', () => {
  const r = decodeImageBase64('')
  assert.ok(!r.ok)
})

ok('karakter non-base64 → ditolak (bukan diabaikan diam-diam)', () => {
  const r = decodeImageBase64('!!!bukan-base64!!!')
  assert.ok(!r.ok)
  assert.match(r.error, /base64/)
})

ok('bytes bukan gambar (PDF) → ditolak dengan pesan format', () => {
  const pdf = Buffer.from('%PDF-1.4 isi dokumen', 'ascii')
  const r = decodeImageBase64(pdf.toString('base64'))
  assert.ok(!r.ok)
  assert.match(r.error, /Format gambar/)
})

ok('lebih dari 5 MB → ditolak', () => {
  const big = Buffer.alloc(MAX_IMAGE_BYTES + 1, 0xff)
  big[0] = 0xff
  big[1] = 0xd8
  big[2] = 0xff
  const r = decodeImageBase64(big.toString('base64'))
  assert.ok(!r.ok)
  assert.match(r.error, /5 MB/)
})

ok('sniffImageMime: buffer pendek/asing → null', () => {
  assert.equal(sniffImageMime(Buffer.from([0x00])), null)
  assert.equal(sniffImageMime(Buffer.from('halo dunia', 'utf8')), null)
})

console.log(`\nimage-data: ${passed} pemeriksaan lolos`)
