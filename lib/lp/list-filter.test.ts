// Uji filter pencarian daftar Landing Page. Jalankan lewat `npm test`.
import assert from 'node:assert/strict'

import { filterLandingPages, hasSearchTerms } from './list-filter'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const PAGES = [
  { id: '1', title: 'profitmaker', slug: 'profitmaker' },
  {
    id: '2',
    title: 'E-course Kelas Produsen',
    slug: 'e-course-kelas-produsen',
  },
  {
    id: '3',
    title: 'Generator Prompt - Anti Marketplace',
    slug: 'generator-prompt-anti-marketplace',
  },
  {
    id: '4',
    title: 'Cleanoz Penghemat BBM - Host live',
    slug: 'cleanoz-penghemat-bbm-hostlive',
  },
  {
    id: '5',
    title: 'Hulao - Anti Marketplace',
    slug: 'hulao-anti-marketplace',
  },
]

const ids = (rows: { id: string }[]) => rows.map((r) => r.id)

console.log('lp/list-filter')

check('query kosong / spasi → semua LP, urutan tetap', () => {
  assert.deepEqual(ids(filterLandingPages(PAGES, '')), [
    '1',
    '2',
    '3',
    '4',
    '5',
  ])
  assert.deepEqual(ids(filterLandingPages(PAGES, '   ')), [
    '1',
    '2',
    '3',
    '4',
    '5',
  ])
})

check('cocok di judul, tidak peka huruf besar/kecil', () => {
  assert.deepEqual(ids(filterLandingPages(PAGES, 'KELAS')), ['2'])
  assert.deepEqual(ids(filterLandingPages(PAGES, 'anti marketplace')), [
    '3',
    '5',
  ])
})

check('cocok di slug walau judul berbeda', () => {
  assert.deepEqual(ids(filterLandingPages(PAGES, 'hostlive')), ['4'])
})

check('beberapa kata = semua kata harus ada (urutan bebas)', () => {
  assert.deepEqual(ids(filterLandingPages(PAGES, 'marketplace generator')), [
    '3',
  ])
  assert.deepEqual(ids(filterLandingPages(PAGES, 'hulao produsen')), [])
})

check('spasi berlebih & tanda hubung di ketikan diabaikan', () => {
  assert.deepEqual(ids(filterLandingPages(PAGES, '  e-course   kelas ')), ['2'])
  assert.deepEqual(ids(filterLandingPages(PAGES, 'penghemat-bbm')), ['4'])
})

check('tidak ada yang cocok → kosong', () => {
  assert.deepEqual(filterLandingPages(PAGES, 'zzz'), [])
})

check('tidak memutasi array asal', () => {
  const copy = [...PAGES]
  filterLandingPages(PAGES, 'hulao')
  assert.deepEqual(PAGES, copy)
})

check('tempel alamat/URL LP → cocok ke slug-nya', () => {
  assert.deepEqual(ids(filterLandingPages(PAGES, '/p/profitmaker')), ['1'])
  assert.deepEqual(ids(filterLandingPages(PAGES, 'hulao.id/p/profitmaker')), [
    '1',
  ])
  assert.deepEqual(
    ids(
      filterLandingPages(
        PAGES,
        'https://hulao.id/p/cleanoz-penghemat-bbm-hostlive?utm_source=ig#top',
      ),
    ),
    ['4'],
  )
})

check('tanda baca lain & en dash tidak menggagalkan pencocokan', () => {
  assert.deepEqual(ids(filterLandingPages(PAGES, 'prompt \u2013 anti')), ['3'])
  assert.deepEqual(ids(filterLandingPages(PAGES, 'bbm, cleanoz')), ['4'])
  assert.deepEqual(ids(filterLandingPages(PAGES, 'kelas_produsen')), ['2'])
})

check('aksen NFC vs NFD dianggap sama', () => {
  const rows = [{ id: 'a', title: 'Caf\u00e9 Kopi', slug: 'cafe-kopi' }]
  assert.deepEqual(ids(filterLandingPages(rows, 'cafe\u0301')), ['a'])
  assert.deepEqual(ids(filterLandingPages(rows, 'CAF\u00c9')), ['a'])
})

check('karakter metaregex aman (bukan pola)', () => {
  assert.deepEqual(filterLandingPages(PAGES, '.*'), PAGES)
  assert.deepEqual(filterLandingPages(PAGES, '[(50%)'), [])
})

check('hasSearchTerms selaras dengan filter', () => {
  assert.equal(hasSearchTerms(''), false)
  assert.equal(hasSearchTerms('   '), false)
  assert.equal(hasSearchTerms('---'), false)
  assert.equal(hasSearchTerms('hulao'), true)
  // tanpa kata bermakna → semua LP tampil
  assert.deepEqual(ids(filterLandingPages(PAGES, '---')), [
    '1',
    '2',
    '3',
    '4',
    '5',
  ])
})

console.log(`lp/list-filter: ${passed} ok`)
