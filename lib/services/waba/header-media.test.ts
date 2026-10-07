// Uji helper PURE header media template (deteksi CDN Meta, pilihan URL saat
// sync, aturan jenis/MIME/ukuran). Jalankan lewat `npm test`.
import assert from 'node:assert/strict'

import {
  chooseSyncedHeaderMediaUrl,
  headerMediaFailureSendCode,
  headerMediaRule,
  headerMediaTemporaryMessage,
  isMetaCdnUrl,
  isTransientGraphError,
  isTransientHttpStatus,
  mediaKindForHeader,
  resolveHeaderMediaMime,
} from './header-media'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const META_SCONTENT =
  'https://scontent.whatsapp.net/v/t61.29466-34/123_n.jpg?ccb=1-7&_nc_sid=8b1bef&oh=01_Q5&oe=6712ABCD'
const HULAO_URL = 'https://hulao.id/uploads/waba-templates/user1/abc123.jpg'

console.log('waba/header-media: isMetaCdnUrl')

check('URL CDN WhatsApp (scontent.whatsapp.net) → true — kasus bug produksi', () => {
  assert.equal(isMetaCdnUrl(META_SCONTENT), true)
})

check('host CDN Meta lain → true', () => {
  assert.equal(isMetaCdnUrl('https://mmg.whatsapp.net/d/f/abc.enc'), true)
  assert.equal(isMetaCdnUrl('https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1'), true)
  assert.equal(isMetaCdnUrl('https://scontent-sin6-1.xx.fbcdn.net/v/t39/1.jpg'), true)
  assert.equal(isMetaCdnUrl('https://fbcdn.net/x.jpg'), true)
  assert.equal(isMetaCdnUrl('http://scontent.whatsapp.net/v/x.jpg'), true)
})

check('host diuji case-insensitive', () => {
  assert.equal(isMetaCdnUrl('https://SCONTENT.WhatsApp.NET/v/x.jpg'), true)
})

check('URL publik hulao → false', () => {
  assert.equal(isMetaCdnUrl(HULAO_URL), false)
  assert.equal(isMetaCdnUrl('http://localhost:3000/uploads/waba-templates/u/x.png'), false)
  assert.equal(isMetaCdnUrl('/uploads/waba-templates/u/x.png'), false)
})

check('subdomain/akhiran palsu → false (cocok hostname, bukan substring)', () => {
  assert.equal(isMetaCdnUrl('https://whatsapp.net.evil.com/x.jpg'), false)
  assert.equal(isMetaCdnUrl('https://evilwhatsapp.net/x.jpg'), false)
  assert.equal(isMetaCdnUrl('https://notfbcdn.net/x.jpg'), false)
  assert.equal(isMetaCdnUrl('https://evil.com/scontent.whatsapp.net/x.jpg'), false)
  assert.equal(isMetaCdnUrl('https://evil.com/?u=https://scontent.whatsapp.net/x.jpg'), false)
})

check('protokol selain http/https & input tidak valid → false', () => {
  assert.equal(isMetaCdnUrl('ftp://scontent.whatsapp.net/x.jpg'), false)
  assert.equal(isMetaCdnUrl('bukan url'), false)
  assert.equal(isMetaCdnUrl(''), false)
  assert.equal(isMetaCdnUrl(null), false)
  assert.equal(isMetaCdnUrl(undefined), false)
})

console.log('waba/header-media: chooseSyncedHeaderMediaUrl')

check('existing URL hulao dipertahankan walau Meta kirim URL CDN', () => {
  assert.equal(chooseSyncedHeaderMediaUrl(HULAO_URL, META_SCONTENT), HULAO_URL)
})

check('existing URL relatif hulao (tanpa base URL) juga dipertahankan', () => {
  assert.equal(chooseSyncedHeaderMediaUrl('/uploads/waba-templates/u/x.jpg', META_SCONTENT), '/uploads/waba-templates/u/x.jpg')
})

check('existing CDN Meta (basi) → diganti URL CDN terbaru', () => {
  const fresh = 'https://scontent.whatsapp.net/v/t61/baru.jpg?oe=7'
  assert.equal(chooseSyncedHeaderMediaUrl(META_SCONTENT, fresh), fresh)
})

check('existing kosong → pakai URL Meta', () => {
  assert.equal(chooseSyncedHeaderMediaUrl(null, META_SCONTENT), META_SCONTENT)
  assert.equal(chooseSyncedHeaderMediaUrl('', META_SCONTENT), META_SCONTENT)
  assert.equal(chooseSyncedHeaderMediaUrl('   ', META_SCONTENT), META_SCONTENT)
})

check('Meta tidak kirim URL → existing tetap (apa pun jenisnya)', () => {
  assert.equal(chooseSyncedHeaderMediaUrl(META_SCONTENT, null), META_SCONTENT)
  assert.equal(chooseSyncedHeaderMediaUrl(HULAO_URL, undefined), HULAO_URL)
  assert.equal(chooseSyncedHeaderMediaUrl(null, null), null)
  assert.equal(chooseSyncedHeaderMediaUrl(null, ''), null)
})

console.log('waba/header-media: mediaKindForHeader & aturan')

check('header media → jenis lowercase; TEXT/kosong → null', () => {
  assert.equal(mediaKindForHeader('IMAGE'), 'image')
  assert.equal(mediaKindForHeader('VIDEO'), 'video')
  assert.equal(mediaKindForHeader('DOCUMENT'), 'document')
  assert.equal(mediaKindForHeader('image'), 'image')
  assert.equal(mediaKindForHeader('TEXT'), null)
  assert.equal(mediaKindForHeader('LOCATION'), null)
  assert.equal(mediaKindForHeader(null), null)
  assert.equal(mediaKindForHeader(undefined), null)
})

check('aturan selaras TEMPLATE_MEDIA_LIMITS (IMAGE 5MB jpeg/png, VIDEO 16MB mp4)', () => {
  assert.deepEqual([...headerMediaRule('image').mimes], ['image/jpeg', 'image/png'])
  assert.equal(headerMediaRule('image').maxBytes, 5 * 1024 * 1024)
  assert.deepEqual([...headerMediaRule('video').mimes], ['video/mp4'])
  assert.equal(headerMediaRule('video').maxBytes, 16 * 1024 * 1024)
  assert.deepEqual([...headerMediaRule('document').mimes], ['application/pdf'])
  // Dokumen dibatasi lebih kecil dari 100MB Meta — buffer ditahan di memori.
  assert.ok(headerMediaRule('document').maxBytes <= 100 * 1024 * 1024)
  assert.ok(headerMediaRule('document').maxBytes >= 5 * 1024 * 1024)
})

console.log('waba/header-media: resolveHeaderMediaMime')

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PDF = Buffer.from('%PDF-1.7\n')
const MP4 = Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32])

check('content-type diizinkan (dengan parameter/kapital) → dipakai', () => {
  assert.equal(resolveHeaderMediaMime('image', 'image/jpeg', JPEG), 'image/jpeg')
  assert.equal(resolveHeaderMediaMime('image', 'Image/PNG; charset=binary', PNG), 'image/png')
  assert.equal(resolveHeaderMediaMime('video', 'video/mp4', MP4), 'video/mp4')
  assert.equal(resolveHeaderMediaMime('document', 'application/pdf', PDF), 'application/pdf')
})

check('content-type generik → tebak dari magic bytes', () => {
  assert.equal(resolveHeaderMediaMime('image', 'application/octet-stream', JPEG), 'image/jpeg')
  assert.equal(resolveHeaderMediaMime('image', null, PNG), 'image/png')
  assert.equal(resolveHeaderMediaMime('video', 'binary/octet-stream', MP4), 'video/mp4')
  assert.equal(resolveHeaderMediaMime('document', '', PDF), 'application/pdf')
})

check('jenis tidak cocok dengan header → null (mis. HTML error page, video di header IMAGE)', () => {
  assert.equal(resolveHeaderMediaMime('image', 'text/html', Buffer.from('<html>')), null)
  assert.equal(resolveHeaderMediaMime('image', 'video/mp4', MP4), null)
  assert.equal(resolveHeaderMediaMime('document', 'image/jpeg', JPEG), null)
  assert.equal(resolveHeaderMediaMime('image', 'image/webp', Buffer.from('RIFF....WEBP')), null)
})

console.log('waba/header-media: klasifikasi gagal sementara vs permanen')

check('isTransientHttpStatus: tanpa status (timeout/jaringan), 408, 429, 5xx → sementara', () => {
  assert.equal(isTransientHttpStatus(undefined), true)
  assert.equal(isTransientHttpStatus(408), true)
  assert.equal(isTransientHttpStatus(429), true)
  assert.equal(isTransientHttpStatus(500), true)
  assert.equal(isTransientHttpStatus(503), true)
})

check('isTransientHttpStatus: 403/404/410/400/200 → permanen', () => {
  assert.equal(isTransientHttpStatus(403), false)
  assert.equal(isTransientHttpStatus(404), false)
  assert.equal(isTransientHttpStatus(410), false)
  assert.equal(isTransientHttpStatus(400), false)
  assert.equal(isTransientHttpStatus(200), false)
})

check('isTransientGraphError: timeout/jaringan, 5xx, 429, kode Meta sementara → sementara', () => {
  assert.equal(isTransientGraphError({ message: 'Graph API tidak bisa dihubungi: aborted' }), true)
  assert.equal(isTransientGraphError({ message: 'x', httpStatus: 500, code: 1 }), true)
  assert.equal(isTransientGraphError({ message: 'x', httpStatus: 503 }), true)
  assert.equal(isTransientGraphError({ message: 'x', httpStatus: 429 }), true)
  // Meta sering membalas 400 untuk "service temporarily unavailable"/rate limit.
  assert.equal(isTransientGraphError({ message: 'x', httpStatus: 400, code: 2 }), true)
  assert.equal(isTransientGraphError({ message: 'x', httpStatus: 400, code: 4 }), true)
  assert.equal(isTransientGraphError({ message: 'x', httpStatus: 400, code: 80007 }), true)
  assert.equal(isTransientGraphError({ message: 'x', httpStatus: 400, code: 130429 }), true)
})

check('isTransientGraphError: 4xx lain (param salah, token invalid) → permanen', () => {
  assert.equal(isTransientGraphError({ message: 'x', httpStatus: 400, code: 100 }), false)
  assert.equal(isTransientGraphError({ message: 'x', httpStatus: 401, code: 190 }), false)
  assert.equal(isTransientGraphError({ message: 'x', httpStatus: 403, code: 10 }), false)
})

check('headerMediaFailureSendCode: sementara → HEADER_MEDIA_TEMPORARY, permanen → TEMPLATE_PARAM_MISMATCH', () => {
  assert.equal(headerMediaFailureSendCode(true), 'HEADER_MEDIA_TEMPORARY')
  assert.equal(headerMediaFailureSendCode(false), 'TEMPLATE_PARAM_MISMATCH')
})

check('headerMediaTemporaryMessage: sebut jenis, minta coba lagi, TIDAK menyuruh unggah ulang', () => {
  const img = headerMediaTemporaryMessage('image')
  assert.match(img, /^Gambar header template/)
  assert.match(img, /coba lagi/)
  assert.doesNotMatch(img, /unggah ulang/)
  assert.match(headerMediaTemporaryMessage('video'), /^Video header template/)
  assert.match(headerMediaTemporaryMessage('document'), /^Dokumen header template/)
})

console.log(`\nwaba/header-media: ${passed} pemeriksaan lolos`)
