// Uji penamaan file upload media Cloud API. Jalankan lewat `npm test`.
import assert from 'node:assert/strict'

import { mediaUploadFileName } from './media-upload'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

console.log('waba/media-upload: mediaUploadFileName')

check('jalur image_base64 tidak berubah: image.<ext>', () => {
  assert.equal(mediaUploadFileName('image/jpeg'), 'image.jpg')
  assert.equal(mediaUploadFileName('image/png'), 'image.png')
  assert.equal(mediaUploadFileName('image/webp'), 'image.webp')
})

check('video mp4 & dokumen pdf → nama + ekstensi benar', () => {
  assert.equal(mediaUploadFileName('video/mp4'), 'video.mp4')
  assert.equal(mediaUploadFileName('application/pdf'), 'document.pdf')
})

check('nama file eksplisit dipakai, ekstensi dipaksa sesuai MIME & karakter aneh dibuang', () => {
  assert.equal(mediaUploadFileName('application/pdf', 'katalog.pdf'), 'katalog.pdf')
  assert.equal(mediaUploadFileName('application/pdf', 'katalog promo'), 'katalog promo.pdf')
  assert.equal(mediaUploadFileName('image/jpeg', '../../etc/passwd'), 'passwd.jpg')
  assert.equal(mediaUploadFileName('video/mp4', '   '), 'video.mp4')
})

check('MIME tak dikenal → .bin (perilaku lama)', () => {
  assert.equal(mediaUploadFileName('application/x-unknown'), 'image.bin')
})

console.log(`\nwaba/media-upload: ${passed} pemeriksaan lolos`)
