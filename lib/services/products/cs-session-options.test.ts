// Uji opsi "CS WhatsApp" di form produk. Jalankan lewat `npm test`.
import assert from 'node:assert/strict'

import {
  type CsSessionRow,
  buildCsSessionOptions,
  csSessionOptionLabel,
  findCsSessionOption,
  formatCsNumber,
} from './cs-session-options'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const row = (o: Partial<CsSessionRow> & { id: string }): CsSessionRow => ({
  displayName: null,
  phoneNumber: '6281234567890',
  provider: 'BAILEYS',
  status: 'CONNECTED',
  isActive: true,
  updatedAt: new Date('2026-10-01T00:00:00Z'),
  ...o,
})

console.log('products/cs-session-options: buildCsSessionOptions')

check('tanpa sesi → tanpa opsi', () => {
  assert.deepEqual(buildCsSessionOptions([], []), [])
})

check('sesi tanpa nomor dibuang (belum pernah pair)', () => {
  assert.deepEqual(
    buildCsSessionOptions(
      [row({ id: 'a', phoneNumber: null }), row({ id: 'b', phoneNumber: '' })],
      [],
    ),
    [],
  )
})

check('satu nomor terhubung → satu opsi', () => {
  const out = buildCsSessionOptions(
    [row({ id: 'a', displayName: 'Toko Kopi' })],
    [],
  )
  assert.deepEqual(out, [
    {
      id: 'a',
      aliasIds: [],
      phoneNumber: '6281234567890',
      displayName: 'Toko Kopi',
      provider: 'BAILEYS',
      isConnected: true,
    },
  ])
})

check('banyak baris satu nomor → satu opsi, wakil = CONNECTED terbaru', () => {
  const out = buildCsSessionOptions(
    [
      row({ id: 'lama-1', status: 'DISCONNECTED', isActive: false }),
      row({ id: 'aktif-tua', updatedAt: new Date('2026-10-02T00:00:00Z') }),
      row({ id: 'aktif-baru', updatedAt: new Date('2026-10-09T00:00:00Z') }),
      row({ id: 'lama-2', status: 'DISCONNECTED' }),
    ],
    [],
  )
  assert.equal(out.length, 1)
  assert.equal(out[0]?.id, 'aktif-baru')
  assert.equal(out[0]?.isConnected, true)
  assert.deepEqual(
    [...(out[0]?.aliasIds ?? [])].sort(),
    ['aktif-tua', 'lama-1', 'lama-2'].sort(),
  )
})

check(
  'nomor yang semua barisnya offline & tidak dipakai produk → dibuang',
  () => {
    assert.deepEqual(
      buildCsSessionOptions([row({ id: 'mati', status: 'DISCONNECTED' })], []),
      [],
    )
  },
)

check('CONNECTED tapi isActive=false dihitung offline', () => {
  assert.deepEqual(
    buildCsSessionOptions([row({ id: 'nonaktif', isActive: false })], []),
    [],
  )
})

check('sesi offline yang SEDANG dipakai produk tetap jadi opsi', () => {
  const out = buildCsSessionOptions(
    [row({ id: 'mati', status: 'DISCONNECTED', displayName: 'CS Lama' })],
    ['mati'],
  )
  assert.equal(out.length, 1)
  assert.equal(out[0]?.id, 'mati')
  assert.equal(out[0]?.isConnected, false)
  assert.equal(out[0]?.displayName, 'CS Lama')
})

check(
  'produk menunjuk id basi, nomornya sudah tersambung lagi → wakil sesi aktif, id basi jadi alias',
  () => {
    const out = buildCsSessionOptions(
      [
        row({ id: 'basi', status: 'DISCONNECTED', isActive: false }),
        row({ id: 'baru' }),
      ],
      ['basi'],
    )
    assert.equal(out.length, 1)
    assert.equal(out[0]?.id, 'baru')
    assert.deepEqual(out[0]?.aliasIds, ['basi'])
    assert.equal(out[0]?.isConnected, true)
  },
)

check(
  'semua baris offline, beberapa dipakai → wakil = baris terpakai terbaru',
  () => {
    const out = buildCsSessionOptions(
      [
        row({
          id: 'tak-terpakai',
          status: 'DISCONNECTED',
          updatedAt: new Date('2026-10-09T00:00:00Z'),
        }),
        row({
          id: 'terpakai-tua',
          status: 'DISCONNECTED',
          updatedAt: new Date('2026-10-02T00:00:00Z'),
        }),
        row({
          id: 'terpakai-baru',
          status: 'DISCONNECTED',
          updatedAt: new Date('2026-10-05T00:00:00Z'),
        }),
      ],
      ['terpakai-tua', 'terpakai-baru'],
    )
    assert.equal(out.length, 1)
    assert.equal(out[0]?.id, 'terpakai-baru')
  },
)

check('nomor dikelompokkan per digit (format berbeda = nomor sama)', () => {
  const out = buildCsSessionOptions(
    [
      row({
        id: 'a',
        phoneNumber: '+62 812-3456-7890',
        status: 'DISCONNECTED',
      }),
      row({ id: 'b', phoneNumber: '6281234567890' }),
    ],
    [],
  )
  assert.equal(out.length, 1)
  assert.equal(out[0]?.phoneNumber, '6281234567890')
})

check('nama: wakil tanpa nama memakai nama baris lain senomor', () => {
  const out = buildCsSessionOptions(
    [
      row({ id: 'baru', displayName: null }),
      row({ id: 'lama', displayName: 'Toko Kopi', status: 'DISCONNECTED' }),
    ],
    [],
  )
  assert.equal(out[0]?.displayName, 'Toko Kopi')
})

check(
  'beberapa nomor: terhubung lebih dulu, offline-terpakai belakangan',
  () => {
    const out = buildCsSessionOptions(
      [
        row({
          id: 'off',
          phoneNumber: '6289999999999',
          status: 'DISCONNECTED',
        }),
        row({ id: 'on-1', phoneNumber: '6281111111111' }),
        row({
          id: 'on-2',
          phoneNumber: '6282222222222',
          provider: 'CLOUD_API',
        }),
      ],
      ['off'],
    )
    assert.deepEqual(
      out.map((o) => o.id),
      ['on-1', 'on-2', 'off'],
    )
    assert.equal(out[1]?.provider, 'CLOUD_API')
  },
)

check('input tidak dimutasi', () => {
  const sessions = [row({ id: 'b' }), row({ id: 'a', status: 'DISCONNECTED' })]
  const snapshot = JSON.stringify(sessions)
  buildCsSessionOptions(sessions, ['a'])
  assert.equal(JSON.stringify(sessions), snapshot)
})

console.log('products/cs-session-options: findCsSessionOption')

const OPTIONS = buildCsSessionOptions(
  [
    row({ id: 'basi', status: 'DISCONNECTED', isActive: false }),
    row({ id: 'baru', displayName: 'Toko Kopi' }),
    row({ id: 'lain', phoneNumber: '6289999999999' }),
  ],
  ['basi'],
)

check('id wakil → opsinya', () => {
  assert.equal(findCsSessionOption(OPTIONS, 'baru')?.id, 'baru')
})

check('id basi (alias) → opsi nomor yang sama', () => {
  assert.equal(findCsSessionOption(OPTIONS, 'basi')?.id, 'baru')
})

check('null / id tak dikenal → null', () => {
  assert.equal(findCsSessionOption(OPTIONS, null), null)
  assert.equal(findCsSessionOption(OPTIONS, undefined), null)
  assert.equal(findCsSessionOption(OPTIONS, 'entah'), null)
})

console.log('products/cs-session-options: label')

check('formatCsNumber menambah tanda +', () => {
  assert.equal(formatCsNumber('6281234567890'), '+6281234567890')
})

check('label: nama + nomor + jenis koneksi', () => {
  assert.equal(
    csSessionOptionLabel({
      id: 'a',
      aliasIds: [],
      phoneNumber: '6281234567890',
      displayName: 'Toko Kopi',
      provider: 'BAILEYS',
      isConnected: true,
    }),
    'Toko Kopi (+6281234567890) · WhatsApp Web',
  )
})

check('label: Cloud API + offline', () => {
  assert.equal(
    csSessionOptionLabel({
      id: 'a',
      aliasIds: [],
      phoneNumber: '6281234567890',
      displayName: 'CS Resmi',
      provider: 'CLOUD_API',
      isConnected: false,
    }),
    'CS Resmi (+6281234567890) · Meta Cloud API · offline',
  )
})

check('label: tanpa nama → nomor saja, tanpa kurung kosong', () => {
  assert.equal(
    csSessionOptionLabel({
      id: 'a',
      aliasIds: [],
      phoneNumber: '6281234567890',
      displayName: null,
      provider: 'BAILEYS',
      isConnected: true,
    }),
    '+6281234567890 · WhatsApp Web',
  )
})

console.log(`products/cs-session-options: ${passed} ok`)
