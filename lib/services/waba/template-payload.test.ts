// Uji buildSendComponents untuk header media template. Jalankan lewat `npm test`.
import assert from 'node:assert/strict'

import {
  buildSendComponents,
  preflightSendParams,
  TemplateParamError,
  type TemplateLike,
} from './template-payload'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const META_SCONTENT = 'https://scontent.whatsapp.net/v/t61.29466-34/123_n.jpg?ccb=1-7&oe=6712ABCD'
const HULAO_URL = 'https://hulao.id/uploads/waba-templates/user1/abc123.jpg'

function imageTemplate(over: Partial<TemplateLike> = {}): TemplateLike {
  return {
    name: 'broadcastantimarketplace1',
    language: 'id',
    category: 'MARKETING',
    headerType: 'IMAGE',
    headerMediaUrl: HULAO_URL,
    bodyText: 'Halo kak, promo minggu ini!',
    ...over,
  }
}

console.log('waba/template-payload: buildSendComponents header media (link)')

check('URL publik hulao → header image link', () => {
  const c = buildSendComponents(imageTemplate(), { body: [] })
  assert.deepEqual(c, [{ type: 'header', parameters: [{ type: 'image', image: { link: HULAO_URL } }] }])
})

check('URL CDN scontent.whatsapp.net tanpa params.header → TemplateParamError (bug produksi 131053)', () => {
  assert.throws(
    () => buildSendComponents(imageTemplate({ headerMediaUrl: META_SCONTENT }), { body: [] }),
    (err: unknown) => err instanceof TemplateParamError && /URL contoh Meta/.test(err.message),
  )
})

check('URL CDN fbcdn/lookaside juga diblok', () => {
  for (const url of ['https://scontent-sin6-1.xx.fbcdn.net/v/1.jpg', 'https://lookaside.fbsbx.com/x?mid=1']) {
    assert.throws(() => buildSendComponents(imageTemplate({ headerMediaUrl: url }), { body: [] }), TemplateParamError)
  }
})

check('params.header link eksplisit tetap dipakai walau template ber-URL CDN', () => {
  const c = buildSendComponents(imageTemplate({ headerMediaUrl: META_SCONTENT }), {
    header: { type: 'image', value: 'https://cdn.toko.com/promo.jpg' },
    body: [],
  })
  assert.deepEqual(c, [
    { type: 'header', parameters: [{ type: 'image', image: { link: 'https://cdn.toko.com/promo.jpg' } }] },
  ])
})

check('tanpa URL sama sekali → TemplateParamError', () => {
  assert.throws(() => buildSendComponents(imageTemplate({ headerMediaUrl: null }), { body: [] }), TemplateParamError)
})

console.log('waba/template-payload: buildSendComponents header media (media id)')

check('mediaId → header image { id }, URL CDN template diabaikan (tanpa error)', () => {
  const c = buildSendComponents(imageTemplate({ headerMediaUrl: META_SCONTENT }), {
    header: { type: 'image', mediaId: '1234567890' },
    body: [],
  })
  assert.deepEqual(c, [{ type: 'header', parameters: [{ type: 'image', image: { id: '1234567890' } }] }])
})

check('mediaId diutamakan daripada value link', () => {
  const c = buildSendComponents(imageTemplate(), {
    header: { type: 'image', value: 'https://cdn.toko.com/a.jpg', mediaId: '99' },
    body: [],
  })
  assert.deepEqual(c, [{ type: 'header', parameters: [{ type: 'image', image: { id: '99' } }] }])
})

check('VIDEO mediaId → header video { id }', () => {
  const c = buildSendComponents(imageTemplate({ headerType: 'VIDEO' }), {
    header: { type: 'video', mediaId: '77' },
    body: [],
  })
  assert.deepEqual(c, [{ type: 'header', parameters: [{ type: 'video', video: { id: '77' } }] }])
})

check('DOCUMENT mediaId + filename → document { id, filename }', () => {
  const c = buildSendComponents(imageTemplate({ headerType: 'DOCUMENT' }), {
    header: { type: 'document', mediaId: '55', filename: 'katalog.pdf' },
    body: [],
  })
  assert.deepEqual(c, [
    { type: 'header', parameters: [{ type: 'document', document: { id: '55', filename: 'katalog.pdf' } }] },
  ])
})

check('header media tanpa value & mediaId → jatuh ke URL template (guard CDN tetap berlaku)', () => {
  const c = buildSendComponents(imageTemplate(), { header: { type: 'image' }, body: [] })
  assert.deepEqual(c, [{ type: 'header', parameters: [{ type: 'image', image: { link: HULAO_URL } }] }])
  assert.throws(
    () => buildSendComponents(imageTemplate({ headerMediaUrl: META_SCONTENT }), { header: { type: 'image' }, body: [] }),
    TemplateParamError,
  )
})

check('header text + body tetap seperti semula', () => {
  const c = buildSendComponents(
    imageTemplate({ headerType: 'TEXT', headerText: 'Halo {{1}}', headerMediaUrl: null, bodyText: 'Kode {{1}}' }),
    { header: { type: 'text', value: 'Budi' }, body: ['A1'] },
  )
  assert.deepEqual(c, [
    { type: 'header', parameters: [{ type: 'text', text: 'Budi' }] },
    { type: 'body', parameters: [{ type: 'text', text: 'A1' }] },
  ])
})

console.log('waba/template-payload: preflightSendParams (validasi pra-kirim broadcast/follow-up)')

check('template ber-URL CDN Meta lolos validasi — saat kirim di-resolve jadi media id', () => {
  const tpl = imageTemplate({ headerMediaUrl: META_SCONTENT })
  assert.doesNotThrow(() => buildSendComponents(tpl, preflightSendParams(tpl, { body: [] })))
})

check('params & URL publik hulao tidak diubah (objek sama)', () => {
  const params = { body: [] }
  assert.equal(preflightSendParams(imageTemplate(), params), params)
  const explicit = { header: { type: 'image' as const, value: 'https://cdn.toko.com/a.jpg' }, body: [] }
  assert.equal(preflightSendParams(imageTemplate({ headerMediaUrl: META_SCONTENT }), explicit), explicit)
})

check('tidak memutasi params asli', () => {
  const params = { body: ['x'] }
  const out = preflightSendParams(imageTemplate({ headerMediaUrl: META_SCONTENT }), params)
  assert.notEqual(out, params)
  assert.deepEqual(params, { body: ['x'] })
})

check('template tanpa URL media tetap ditolak (tidak bisa di-resolve)', () => {
  const tpl = imageTemplate({ headerMediaUrl: null })
  assert.throws(() => buildSendComponents(tpl, preflightSendParams(tpl, { body: [] })), TemplateParamError)
})

console.log(`\nwaba/template-payload: ${passed} pemeriksaan lolos`)
