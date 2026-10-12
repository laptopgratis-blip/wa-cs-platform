// Uji aturan "CS WhatsApp per produk" (helper pure). Jalankan lewat `npm test`.
import assert from 'node:assert/strict'

import {
  type CsSessionState,
  chooseCustomerWaNumber,
  extractOrderProductIds,
  normalizeCsNumber,
  pickOrderCsSessionId,
  resolveCsSender,
} from './order-cs'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const sess = (o: Partial<CsSessionState> & { id: string }): CsSessionState => ({
  phoneNumber: '6281234567890',
  status: 'CONNECTED',
  isActive: true,
  ...o,
})

console.log('orders/order-cs: extractOrderProductIds')

check('items bukan array (null/undefined/objek/string/angka) → []', () => {
  for (const bad of [null, undefined, {}, 'abc', 42, true]) {
    assert.deepEqual(extractOrderProductIds(bad), [])
  }
})

check('array kosong (order Sales Flow) → []', () => {
  assert.deepEqual(extractOrderProductIds([]), [])
})

check('urutan item dipertahankan', () => {
  const items = [
    { productId: 'p2', name: 'B', qty: 1, price: 1 },
    { productId: 'p1', name: 'A', qty: 1, price: 1 },
  ]
  assert.deepEqual(extractOrderProductIds(items), ['p2', 'p1'])
})

check('produk sama beda varian → satu id, posisi kemunculan pertama', () => {
  const items = [
    { productId: 'p1', variantId: 'v1' },
    { productId: 'p2', variantId: null },
    { productId: 'p1', variantId: 'v2' },
  ]
  assert.deepEqual(extractOrderProductIds(items), ['p1', 'p2'])
})

check('item rusak dilewati tanpa melempar', () => {
  const items = [
    null,
    'teks',
    7,
    [],
    {},
    { productId: 123 },
    { productId: '' },
    { productId: '   ' },
    { productId: null },
    { name: 'tanpa id (order lama)', qty: 1, price: 1 },
    { productId: 'p9' },
  ]
  assert.deepEqual(extractOrderProductIds(items), ['p9'])
})

console.log('orders/order-cs: pickOrderCsSessionId')

check('tanpa produk → null', () => {
  assert.equal(pickOrderCsSessionId([], new Map([['p1', 's1']])), null)
})

check('satu produk ber-CS → sesi produk itu', () => {
  assert.equal(pickOrderCsSessionId(['p1'], new Map([['p1', 's1']])), 's1')
})

check('produk tanpa CS (null / tidak ada di peta) → null', () => {
  assert.equal(pickOrderCsSessionId(['p1'], new Map([['p1', null]])), null)
  assert.equal(pickOrderCsSessionId(['p1'], new Map()), null)
})

check(
  'multi-produk: item PERTAMA yang ber-CS menang, bukan urutan peta',
  () => {
    const map = new Map<string, string | null>([
      ['p3', 's3'],
      ['p2', 's2'],
      ['p1', null],
    ])
    assert.equal(pickOrderCsSessionId(['p1', 'p2', 'p3'], map), 's2')
    assert.equal(pickOrderCsSessionId(['p3', 'p2', 'p1'], map), 's3')
  },
)

check('produk terhapus di depan dilewati → CS produk berikutnya', () => {
  const map = new Map<string, string | null>([['p2', 's2']])
  assert.equal(pickOrderCsSessionId(['terhapus', 'p2'], map), 's2')
})

check('csSessionId string kosong diperlakukan tanpa CS', () => {
  assert.equal(pickOrderCsSessionId(['p1'], new Map([['p1', '']])), null)
})

console.log('orders/order-cs: normalizeCsNumber')

check('digit 10-15 → diterima; tanda baca dibuang; non-62 boleh', () => {
  assert.equal(normalizeCsNumber('6281234567890'), '6281234567890')
  assert.equal(normalizeCsNumber('+62 812-3456-7890'), '6281234567890')
  assert.equal(normalizeCsNumber('60123456789'), '60123456789')
  assert.equal(normalizeCsNumber('1234567890'), '1234567890')
  assert.equal(normalizeCsNumber('123456789012345'), '123456789012345')
})

check('null / kosong / terlalu pendek / terlalu panjang → null', () => {
  assert.equal(normalizeCsNumber(null), null)
  assert.equal(normalizeCsNumber(undefined), null)
  assert.equal(normalizeCsNumber(''), null)
  assert.equal(normalizeCsNumber('abc'), null)
  assert.equal(normalizeCsNumber('123456789'), null)
  assert.equal(normalizeCsNumber('1234567890123456'), null)
})

console.log('orders/order-cs: resolveCsSender')

check('tanpa sesi CS → semuanya null', () => {
  assert.deepEqual(
    resolveCsSender({ csSession: null, userSessions: [sess({ id: 'a' })] }),
    { preferredSessionId: null, csNumber: null },
  )
})

check('sesi CS CONNECTED & aktif → dipakai langsung', () => {
  const cs = sess({ id: 'cs' })
  assert.deepEqual(resolveCsSender({ csSession: cs, userSessions: [cs] }), {
    preferredSessionId: 'cs',
    csNumber: '6281234567890',
  })
})

check(
  'sesi basi (scan ulang) → padanan nomor sama yang CONNECTED & aktif',
  () => {
    const stale = sess({ id: 'lama', status: 'DISCONNECTED', isActive: false })
    const fresh = sess({ id: 'baru' })
    const other = sess({ id: 'lain', phoneNumber: '6289999999999' })
    assert.deepEqual(
      resolveCsSender({
        csSession: stale,
        userSessions: [other, stale, fresh],
      }),
      { preferredSessionId: 'baru', csNumber: '6281234567890' },
    )
  },
)

check('CONNECTED tapi isActive=false dianggap offline → cari padanan', () => {
  const inactive = sess({ id: 'lama', isActive: false })
  const fresh = sess({ id: 'baru' })
  assert.equal(
    resolveCsSender({ csSession: inactive, userSessions: [inactive, fresh] })
      .preferredSessionId,
    'baru',
  )
})

check('padanan dicocokkan per digit (format nomor berbeda)', () => {
  const stale = sess({ id: 'lama', status: 'DISCONNECTED' })
  const fresh = sess({ id: 'baru', phoneNumber: '+62 812-3456-7890' })
  assert.equal(
    resolveCsSender({ csSession: stale, userSessions: [fresh] })
      .preferredSessionId,
    'baru',
  )
})

check('beberapa padanan → yang updatedAt terbaru', () => {
  const stale = sess({ id: 'lama', status: 'DISCONNECTED' })
  const older = sess({ id: 'a', updatedAt: new Date('2026-10-01T00:00:00Z') })
  const newer = sess({ id: 'b', updatedAt: new Date('2026-10-10T00:00:00Z') })
  assert.equal(
    resolveCsSender({ csSession: stale, userSessions: [older, newer] })
      .preferredSessionId,
    'b',
  )
  assert.equal(
    resolveCsSender({ csSession: stale, userSessions: [newer, older] })
      .preferredSessionId,
    'b',
  )
})

check('padanan yang juga offline diabaikan', () => {
  const stale = sess({ id: 'lama', status: 'DISCONNECTED' })
  const alsoDown = sess({ id: 'x', status: 'PAUSED' })
  const inactive = sess({ id: 'y', isActive: false })
  assert.deepEqual(
    resolveCsSender({ csSession: stale, userSessions: [alsoDown, inactive] }),
    { preferredSessionId: null, csNumber: '6281234567890' },
  )
})

check('tidak ada padanan → preferred null, csNumber TETAP nomor CS', () => {
  const stale = sess({ id: 'lama', status: 'DISCONNECTED' })
  const other = sess({ id: 'lain', phoneNumber: '6289999999999' })
  assert.deepEqual(
    resolveCsSender({ csSession: stale, userSessions: [other] }),
    { preferredSessionId: null, csNumber: '6281234567890' },
  )
})

// "Hapus nomor" di /whatsapp = soft-delete (isActive=false, phoneNumber tetap
// tersimpan). Nomor yang sudah dihapus tidak boleh terus dipakai sebagai
// tujuan chat pelanggan — beda dengan nomor yang sekadar offline.
check(
  'sesi CS DIHAPUS (isActive=false) tanpa padanan → csNumber null (jatuh ke nomor toko)',
  () => {
    const wiped = sess({ id: 'lama', status: 'DISCONNECTED', isActive: false })
    const other = sess({ id: 'lain', phoneNumber: '6289999999999' })
    assert.deepEqual(
      resolveCsSender({ csSession: wiped, userSessions: [other, wiped] }),
      { preferredSessionId: null, csNumber: null },
    )
    assert.deepEqual(resolveCsSender({ csSession: wiped, userSessions: [] }), {
      preferredSessionId: null,
      csNumber: null,
    })
  },
)

check(
  'sesi CS dihapus, nomor sama terdaftar lagi tapi sedang offline → preferred null, csNumber tetap',
  () => {
    const wiped = sess({ id: 'lama', status: 'DISCONNECTED', isActive: false })
    const rescanned = sess({ id: 'baru', status: 'PAUSED' })
    assert.deepEqual(
      resolveCsSender({ csSession: wiped, userSessions: [rescanned] }),
      { preferredSessionId: null, csNumber: '6281234567890' },
    )
  },
)

check(
  'sesi CS dihapus, baris senomor lain juga dihapus → csNumber null',
  () => {
    const wiped = sess({ id: 'lama', status: 'DISCONNECTED', isActive: false })
    const alsoWiped = sess({ id: 'x', status: 'DISCONNECTED', isActive: false })
    assert.deepEqual(
      resolveCsSender({ csSession: wiped, userSessions: [alsoWiped] }),
      { preferredSessionId: null, csNumber: null },
    )
  },
)

check(
  'sesi CS offline SEMENTARA (isActive=true: PAUSED/CONNECTING/ERROR) tanpa padanan → csNumber tetap',
  () => {
    for (const status of ['PAUSED', 'CONNECTING', 'WAITING_QR', 'ERROR']) {
      assert.deepEqual(
        resolveCsSender({
          csSession: sess({ id: 'cs', status }),
          userSessions: [],
        }),
        { preferredSessionId: null, csNumber: '6281234567890' },
        status,
      )
    }
  },
)

check(
  'nomor sesi null → csNumber null; sesi online tetap jadi pengirim',
  () => {
    const online = sess({ id: 'cs', phoneNumber: null })
    assert.deepEqual(resolveCsSender({ csSession: online, userSessions: [] }), {
      preferredSessionId: 'cs',
      csNumber: null,
    })
  },
)

check(
  'nomor sesi null & offline → tidak mencocokkan sesi tak bernomor lain',
  () => {
    const stale = sess({
      id: 'lama',
      phoneNumber: null,
      status: 'DISCONNECTED',
    })
    const blank = sess({ id: 'kosong', phoneNumber: null })
    assert.deepEqual(
      resolveCsSender({ csSession: stale, userSessions: [blank] }),
      { preferredSessionId: null, csNumber: null },
    )
  },
)

check('nomor sesi terlalu pendek → csNumber null', () => {
  const cs = sess({ id: 'cs', phoneNumber: '62812' })
  assert.equal(
    resolveCsSender({ csSession: cs, userSessions: [] }).csNumber,
    null,
  )
})

console.log('orders/order-cs: chooseCustomerWaNumber')

check('ada nomor CS → dipakai, walau konfirmasi WA nonaktif/kosong', () => {
  assert.deepEqual(
    chooseCustomerWaNumber({
      csNumber: '6281234567890',
      waConfirmActive: false,
      waConfirmNumber: null,
    }),
    { number: '6281234567890' },
  )
})

check('nomor CS mengalahkan nomor konfirmasi toko yang aktif', () => {
  assert.deepEqual(
    chooseCustomerWaNumber({
      csNumber: '6281234567890',
      waConfirmActive: true,
      waConfirmNumber: '6289999999999',
    }),
    { number: '6281234567890' },
  )
})

check('nomor CS non-62 tetap dipakai', () => {
  assert.deepEqual(
    chooseCustomerWaNumber({
      csNumber: '60123456789',
      waConfirmActive: false,
      waConfirmNumber: null,
    }),
    { number: '60123456789' },
  )
})

check(
  'tanpa CS + konfirmasi aktif & nomor valid → nomor toko (perilaku lama)',
  () => {
    assert.deepEqual(
      chooseCustomerWaNumber({
        csNumber: null,
        waConfirmActive: true,
        waConfirmNumber: '6289999999999',
      }),
      { number: '6289999999999' },
    )
  },
)

check('tanpa CS + konfirmasi NONAKTIF → null', () => {
  assert.equal(
    chooseCustomerWaNumber({
      csNumber: null,
      waConfirmActive: false,
      waConfirmNumber: '6289999999999',
    }),
    null,
  )
})

check('tanpa CS + nomor toko kosong / bukan 62 / terlalu pendek → null', () => {
  for (const bad of [
    null,
    undefined,
    '',
    '0812345678',
    '6281',
    '60123456789',
  ]) {
    assert.equal(
      chooseCustomerWaNumber({
        csNumber: null,
        waConfirmActive: true,
        waConfirmNumber: bad,
      }),
      null,
      String(bad),
    )
  }
})

check('tanpa CS + profil belum ada (semua undefined) → null', () => {
  assert.equal(chooseCustomerWaNumber({ csNumber: null }), null)
})

check(
  'csNumber cacat (bukan 10-15 digit) diabaikan → jatuh ke nomor toko',
  () => {
    assert.deepEqual(
      chooseCustomerWaNumber({
        csNumber: '62812',
        waConfirmActive: true,
        waConfirmNumber: '6289999999999',
      }),
      { number: '6289999999999' },
    )
    assert.equal(
      chooseCustomerWaNumber({ csNumber: 'abc', waConfirmActive: false }),
      null,
    )
  },
)

console.log(`orders/order-cs: ${passed} ok`)
