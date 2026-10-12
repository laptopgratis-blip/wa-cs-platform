// Uji helper edit data pelanggan pesanan. Jalankan lewat `npm test`.
import assert from 'node:assert/strict'

import {
  type CustomerEditExisting,
  PHONE_INVALID_ERROR,
  buildCustomerEditData,
  buildCustomerEditRequest,
  customerDraftFromOrder,
  normalizeOrderPhone,
  orderHasShipping,
  planQueueRefresh,
  toOrderPhoneDigits,
} from './customer-edit'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

// Salinan PERSIS normalizePhone lama di app/api/orders/submit/route.ts —
// pengunci: helper hasil ekstraksi tidak boleh mengubah perilaku submit.
function legacySubmitNormalize(input: string): string {
  let p = input.replace(/[^\d]/g, '')
  if (p.startsWith('0')) p = '62' + p.slice(1)
  else if (p.startsWith('8')) p = '62' + p
  return p
}

const PHYSICAL: CustomerEditExisting = {
  customerName: 'Budi Santoso',
  customerPhone: '6281234567890',
  customerAddress: 'Jl. Mawar No. 5',
  shippingAddress: 'Jl. Mawar No. 5',
  shippingPostalCode: '40123',
  isDigitalOnly: false,
}

const DIGITAL: CustomerEditExisting = {
  customerName: 'Sari',
  customerPhone: '6281234567890',
  customerAddress: null,
  shippingAddress: null,
  shippingPostalCode: null,
  isDigitalOnly: true,
}

function okResult(r: ReturnType<typeof buildCustomerEditData>) {
  assert.equal(r.ok, true, r.ok ? '' : r.error)
  if (!r.ok) throw new Error('tidak terjangkau')
  return r
}

console.log('orders/customer-edit: toOrderPhoneDigits (pengunci submit)')

check('hasil identik dengan normalizePhone lama di orders/submit', () => {
  const samples = [
    '081234567890',
    '0812-3456-7890',
    '0812 3456 7890',
    '81234567890',
    '6281234567890',
    '+6281234567890',
    '+62 812-3456-7890',
    '+60123456789',
    '12345678',
    '',
    'abc',
    '008123',
  ]
  for (const s of samples) {
    assert.equal(toOrderPhoneDigits(s), legacySubmitNormalize(s), s)
  }
})

check('0… → 62…, 8… → 62…, 62… tetap', () => {
  assert.equal(toOrderPhoneDigits('081234567890'), '6281234567890')
  assert.equal(toOrderPhoneDigits('81234567890'), '6281234567890')
  assert.equal(toOrderPhoneDigits('6281234567890'), '6281234567890')
})

console.log('orders/customer-edit: normalizeOrderPhone')

check('format Indonesia umum → digit 628…', () => {
  for (const raw of [
    '081234567890',
    '0812-3456-7890',
    ' 0812 3456 7890 ',
    '81234567890',
    '6281234567890',
    '+6281234567890',
    '+62 812 3456 7890',
  ]) {
    assert.deepEqual(normalizeOrderPhone(raw), {
      ok: true,
      phone: '6281234567890',
    })
  }
})

check('nomor Indonesia valid = sama dengan hasil submit', () => {
  for (const raw of ['081234567890', '8123456789', '+62 811-222-333']) {
    const r = normalizeOrderPhone(raw)
    assert.equal(r.ok && r.phone, legacySubmitNormalize(raw))
  }
})

check('batas panjang Indonesia: total 11-15 digit', () => {
  assert.equal(normalizeOrderPhone('62812345678').ok, true) // 11
  assert.equal(normalizeOrderPhone('628123456789012').ok, true) // 15
  assert.equal(normalizeOrderPhone('6281234567').ok, false) // 10
  assert.equal(normalizeOrderPhone('6281234567890123').ok, false) // 16
})

check('nomor luar negeri berawalan + (10-15 digit) → digit apa adanya', () => {
  assert.deepEqual(normalizeOrderPhone('+60 12-345 6789'), {
    ok: true,
    phone: '60123456789',
  })
  // Diawali 8 setelah '+': TIDAK boleh diberi prefiks 62.
  assert.deepEqual(normalizeOrderPhone('+8613800138000'), {
    ok: true,
    phone: '8613800138000',
  })
  assert.deepEqual(normalizeOrderPhone('+1 415 555 2671'), {
    ok: true,
    phone: '14155552671',
  })
})

check('luar negeri di luar 10-15 digit / diawali 0 → error', () => {
  assert.equal(normalizeOrderPhone('+601234567').ok, false) // 9 digit
  assert.equal(normalizeOrderPhone('+1234567890123456').ok, false) // 16
  assert.equal(normalizeOrderPhone('+0123456789').ok, false)
})

check('selain itu → error "Nomor HP tidak valid"', () => {
  for (const raw of [
    '',
    '   ',
    'abc',
    '12345678',
    '60123456789', // luar negeri tanpa '+'
    '0212345678', // telepon rumah: 62 21… bukan 628
    '0812345', // kependekan
    '62812', // terpotong
  ]) {
    assert.deepEqual(normalizeOrderPhone(raw), {
      ok: false,
      error: PHONE_INVALID_ERROR,
    })
  }
  assert.equal(PHONE_INVALID_ERROR, 'Nomor HP tidak valid')
})

check('huruf di tengah nomor → error (bukan dibuang diam-diam)', () => {
  assert.equal(normalizeOrderPhone('0812abc34567890').ok, false)
  assert.equal(normalizeOrderPhone('628123456789@lid').ok, false)
})

console.log('orders/customer-edit: orderHasShipping')

check('order fisik → true; digital tanpa alamat kirim → false', () => {
  assert.equal(orderHasShipping(PHYSICAL), true)
  assert.equal(orderHasShipping(DIGITAL), false)
})

check('digital tapi shippingAddress terisi → true', () => {
  assert.equal(orderHasShipping({ ...DIGITAL, shippingAddress: 'Jl. A' }), true)
})

console.log('orders/customer-edit: buildCustomerEditData')

check('input kosong → tidak ada perubahan', () => {
  const r = okResult(buildCustomerEditData(PHYSICAL, {}))
  assert.deepEqual(r.data, {})
  assert.deepEqual(r.changed, {
    name: false,
    phone: false,
    address: false,
    postalCode: false,
  })
  assert.equal(r.anyChanged, false)
})

check('nilai sama persis (termasuk spasi tepi) → tidak berubah', () => {
  const r = okResult(
    buildCustomerEditData(PHYSICAL, {
      customerName: '  Budi Santoso ',
      customerPhone: '0812-3456-7890',
      customerAddress: ' Jl. Mawar No. 5 ',
      shippingPostalCode: '40123',
    }),
  )
  assert.deepEqual(r.data, {})
  assert.equal(r.anyChanged, false)
})

check('nama berubah → hanya customerName', () => {
  const r = okResult(
    buildCustomerEditData(PHYSICAL, { customerName: ' Budi Santosa ' }),
  )
  assert.deepEqual(r.data, { customerName: 'Budi Santosa' })
  assert.deepEqual(r.changed, {
    name: true,
    phone: false,
    address: false,
    postalCode: false,
  })
  assert.equal(r.anyChanged, true)
})

check('nama < 2 atau > 120 karakter → error', () => {
  assert.equal(
    buildCustomerEditData(PHYSICAL, { customerName: ' A ' }).ok,
    false,
  )
  assert.equal(
    buildCustomerEditData(PHYSICAL, { customerName: 'x'.repeat(121) }).ok,
    false,
  )
})

check('nomor berubah → tersimpan ternormalisasi 628…', () => {
  const r = okResult(
    buildCustomerEditData(PHYSICAL, { customerPhone: '0857 1111 2222' }),
  )
  assert.deepEqual(r.data, { customerPhone: '6285711112222' })
  assert.equal(r.changed.phone, true)
})

check('nomor tidak valid → error Nomor HP tidak valid', () => {
  const r = buildCustomerEditData(PHYSICAL, { customerPhone: '12345678' })
  assert.deepEqual(r, { ok: false, error: PHONE_INVALID_ERROR })
})

check(
  'nomor lama tak-valid dikirim ulang apa adanya → tidak berubah, tanpa error',
  () => {
    // Order Sales Flow bisa menyimpan JID LID / nomor lama tak ternormalisasi.
    const legacy = { ...PHYSICAL, customerPhone: '123456@lid' }
    const r = okResult(
      buildCustomerEditData(legacy, {
        customerPhone: '123456@lid',
        customerName: 'Budi S',
      }),
    )
    assert.deepEqual(r.data, { customerName: 'Budi S' })
    assert.equal(r.changed.phone, false)
  },
)

check(
  'alamat order fisik → ditulis ke customerAddress DAN shippingAddress',
  () => {
    const r = okResult(
      buildCustomerEditData(PHYSICAL, {
        customerAddress: ' Jl. Melati No. 7\nRT 01 ',
      }),
    )
    assert.deepEqual(r.data, {
      customerAddress: 'Jl. Melati No. 7\nRT 01',
      shippingAddress: 'Jl. Melati No. 7\nRT 01',
    })
    assert.equal(r.changed.address, true)
  },
)

check('order fisik dengan shippingAddress null → tetap dua kolom', () => {
  // Order Sales Flow: isDigitalOnly false, hanya customerAddress terisi.
  const flow = { ...PHYSICAL, shippingAddress: null }
  const r = okResult(
    buildCustomerEditData(flow, { customerAddress: 'Jl. Baru 1' }),
  )
  assert.deepEqual(r.data, {
    customerAddress: 'Jl. Baru 1',
    shippingAddress: 'Jl. Baru 1',
  })
})

check(
  'dua kolom tidak sinkron + alamat sama dgn customerAddress → disamakan',
  () => {
    const drift = { ...PHYSICAL, shippingAddress: 'Alamat lama' }
    const r = okResult(
      buildCustomerEditData(drift, { customerAddress: 'Jl. Mawar No. 5' }),
    )
    assert.deepEqual(r.data, {
      customerAddress: 'Jl. Mawar No. 5',
      shippingAddress: 'Jl. Mawar No. 5',
    })
    assert.equal(r.changed.address, true)
  },
)

check('alamat kosong pada order fisik → DITOLAK', () => {
  for (const v of ['', '   ', null]) {
    const r = buildCustomerEditData(PHYSICAL, { customerAddress: v })
    assert.equal(r.ok, false)
    assert.match(r.ok ? '' : r.error, /Alamat/)
  }
})

check(
  'order fisik tanpa alamat sama sekali + alamat kosong → tidak berubah',
  () => {
    const noAddr = { ...PHYSICAL, customerAddress: null, shippingAddress: null }
    const r = okResult(buildCustomerEditData(noAddr, { customerAddress: '' }))
    assert.deepEqual(r.data, {})
    assert.equal(r.changed.address, false)
  },
)

check('order digital tanpa pengiriman → customerAddress saja', () => {
  const r = okResult(
    buildCustomerEditData(DIGITAL, { customerAddress: 'Jl. Anggrek 9' }),
  )
  assert.deepEqual(r.data, { customerAddress: 'Jl. Anggrek 9' })
  assert.equal('shippingAddress' in r.data, false)
})

check('order digital: alamat kosong → null (boleh dikosongkan)', () => {
  const filled = { ...DIGITAL, customerAddress: 'Jl. Anggrek 9' }
  const r = okResult(buildCustomerEditData(filled, { customerAddress: '  ' }))
  assert.deepEqual(r.data, { customerAddress: null })
  assert.equal(r.changed.address, true)
})

check('order digital dgn shippingAddress terisi → diperlakukan fisik', () => {
  const mixed = {
    ...DIGITAL,
    customerAddress: 'Jl. A 1',
    shippingAddress: 'Jl. A 1',
  }
  const r = okResult(
    buildCustomerEditData(mixed, { customerAddress: 'Jl. B 2' }),
  )
  assert.deepEqual(r.data, {
    customerAddress: 'Jl. B 2',
    shippingAddress: 'Jl. B 2',
  })
  assert.equal(buildCustomerEditData(mixed, { customerAddress: '' }).ok, false)
})

check('alamat > 1000 karakter → error', () => {
  const r = buildCustomerEditData(PHYSICAL, {
    customerAddress: 'a'.repeat(1001),
  })
  assert.equal(r.ok, false)
})

check('kode pos 5 digit → tersimpan; sama → tidak berubah', () => {
  const r = okResult(
    buildCustomerEditData(PHYSICAL, { shippingPostalCode: ' 40999 ' }),
  )
  assert.deepEqual(r.data, { shippingPostalCode: '40999' })
  assert.equal(r.changed.postalCode, true)
})

check('kode pos kosong → null', () => {
  for (const v of ['', '  ', null]) {
    const r = okResult(
      buildCustomerEditData(PHYSICAL, { shippingPostalCode: v }),
    )
    assert.deepEqual(r.data, { shippingPostalCode: null })
  }
  const none = { ...PHYSICAL, shippingPostalCode: null }
  const same = okResult(buildCustomerEditData(none, { shippingPostalCode: '' }))
  assert.deepEqual(same.data, {})
})

check('kode pos bukan 5 digit → error', () => {
  for (const v of ['4012', '401234', '4012a', '40 12']) {
    const r = buildCustomerEditData(PHYSICAL, { shippingPostalCode: v })
    assert.equal(r.ok, false, v)
    assert.match(r.ok ? '' : r.error, /Kode pos/)
  }
})

check('semua field berubah sekaligus', () => {
  const r = okResult(
    buildCustomerEditData(PHYSICAL, {
      customerName: 'Budi S',
      customerPhone: '+62 857 1111 2222',
      customerAddress: 'Jl. Kenanga 3',
      shippingPostalCode: '40555',
    }),
  )
  assert.deepEqual(r.data, {
    customerName: 'Budi S',
    customerPhone: '6285711112222',
    customerAddress: 'Jl. Kenanga 3',
    shippingAddress: 'Jl. Kenanga 3',
    shippingPostalCode: '40555',
  })
  assert.deepEqual(r.changed, {
    name: true,
    phone: true,
    address: true,
    postalCode: true,
  })
})

check('tidak memutasi objek existing/input', () => {
  const existing = Object.freeze({ ...PHYSICAL })
  const input = Object.freeze({ customerName: 'Baru Nama' })
  okResult(buildCustomerEditData(existing, input))
})

console.log('orders/customer-edit: form dialog (draft → body PATCH)')

check('customerDraftFromOrder: null → string kosong', () => {
  assert.deepEqual(customerDraftFromOrder(PHYSICAL), {
    name: 'Budi Santoso',
    phone: '6281234567890',
    address: 'Jl. Mawar No. 5',
    postalCode: '40123',
  })
  assert.deepEqual(customerDraftFromOrder(DIGITAL), {
    name: 'Sari',
    phone: '6281234567890',
    address: '',
    postalCode: '',
  })
})

check('draft tidak diubah → body kosong', () => {
  const r = buildCustomerEditRequest(PHYSICAL, customerDraftFromOrder(PHYSICAL))
  assert.deepEqual(r, { ok: true, body: {}, anyChanged: false })
})

check('hanya field yang diubah yang dikirim, nomor ternormalisasi', () => {
  const draft = {
    ...customerDraftFromOrder(PHYSICAL),
    phone: '0857-1111-2222',
    address: 'Jl. Melati 7',
  }
  const r = buildCustomerEditRequest(PHYSICAL, draft)
  assert.deepEqual(r, {
    ok: true,
    body: { customerPhone: '6285711112222', customerAddress: 'Jl. Melati 7' },
    anyChanged: true,
  })
})

check('body tidak pernah memuat shippingAddress (diturunkan server)', () => {
  const draft = { ...customerDraftFromOrder(PHYSICAL), address: 'Jl. Baru 9' }
  const r = buildCustomerEditRequest(PHYSICAL, draft)
  assert.equal(r.ok && 'shippingAddress' in r.body, false)
})

check('nomor diketik ulang dalam format lain (sama) → tidak dikirim', () => {
  const draft = { ...customerDraftFromOrder(PHYSICAL), phone: '0812 3456 7890' }
  const r = buildCustomerEditRequest(PHYSICAL, draft)
  assert.deepEqual(r, { ok: true, body: {}, anyChanged: false })
})

check('field yang tidak disentuh tidak ikut divalidasi/dikirim', () => {
  // Dua kolom alamat tidak sinkron + nomor lama tak-valid: selama seller
  // hanya mengubah nama, alamat & nomor tidak ikut terkirim.
  const legacy = {
    ...PHYSICAL,
    customerPhone: '123456@lid',
    shippingAddress: 'Alamat kirim lain',
  }
  const draft = { ...customerDraftFromOrder(legacy), name: 'Budi S' }
  const r = buildCustomerEditRequest(legacy, draft)
  assert.deepEqual(r, {
    ok: true,
    body: { customerName: 'Budi S' },
    anyChanged: true,
  })
})

check('draft tidak valid → error untuk toast', () => {
  const badPhone = { ...customerDraftFromOrder(PHYSICAL), phone: '1234' }
  assert.deepEqual(buildCustomerEditRequest(PHYSICAL, badPhone), {
    ok: false,
    error: PHONE_INVALID_ERROR,
  })
  const noAddr = { ...customerDraftFromOrder(PHYSICAL), address: '  ' }
  assert.equal(buildCustomerEditRequest(PHYSICAL, noAddr).ok, false)
  const badZip = { ...customerDraftFromOrder(PHYSICAL), postalCode: '123' }
  assert.equal(buildCustomerEditRequest(PHYSICAL, badZip).ok, false)
})

check(
  'order digital tanpa pengiriman: kode pos diabaikan, alamat opsional',
  () => {
    const draft = {
      ...customerDraftFromOrder(DIGITAL),
      address: 'Jl. Anggrek 9',
      postalCode: '99999',
    }
    const r = buildCustomerEditRequest(DIGITAL, draft)
    assert.deepEqual(r, {
      ok: true,
      body: { customerAddress: 'Jl. Anggrek 9' },
      anyChanged: true,
    })
  },
)

console.log('orders/customer-edit: planQueueRefresh')

check('pesan belum diedit manual (current === old) → replace', () => {
  assert.equal(
    planQueueRefresh({
      oldResolved: 'Halo Budi',
      currentResolved: 'Halo Budi',
      newResolved: 'Halo Budi S',
    }),
    'replace',
  )
})

check('pesan sudah diedit manual → keep', () => {
  assert.equal(
    planQueueRefresh({
      oldResolved: 'Halo Budi',
      currentResolved: 'Halo Pak Budi, ada promo',
      newResolved: 'Halo Budi S',
    }),
    'keep',
  )
})

check('beda spasi saja tetap dianggap editan manual → keep', () => {
  assert.equal(
    planQueueRefresh({
      oldResolved: 'Halo Budi',
      currentResolved: 'Halo Budi ',
      newResolved: 'Halo Budi S',
    }),
    'keep',
  )
})

console.log(`\n${passed} uji lulus`)
