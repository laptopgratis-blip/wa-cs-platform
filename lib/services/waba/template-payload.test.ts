// Uji buildSendComponents untuk header media template. Jalankan lewat `npm test`.
import assert from 'node:assert/strict'

import { buildSendComponents, TemplateParamError, type TemplateLike } from './template-payload'

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

console.log(`\nwaba/template-payload: ${passed} pemeriksaan lolos`)
