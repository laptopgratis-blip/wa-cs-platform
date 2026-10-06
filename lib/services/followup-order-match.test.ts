// Uji matchFollowUpTemplatesForOrder. Jalankan lewat `npm test`.
// Bagian 1 = characterization: MENGUNCI perilaku lama followup-engine untuk
// order non-flow (orderSessionId null) — harus identik dengan filter query
// Prisma + filter Node sebelum refactor.
// Bagian 2 = guard khusus order Sales Flow (orderSessionId terisi).
import assert from 'node:assert/strict'

import {
  type MatchableOrder,
  type FollowupEvent,
  type MatchableTemplate,
  MAX_DELAY_DAYS,
  mapEventToTriggers,
  matchFollowUpTemplatesForOrder,
} from './followup-order-match'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

function tpl(over: Partial<MatchableTemplate> & { id: string }): MatchableTemplate {
  return {
    trigger: 'ORDER_CREATED',
    paymentMethod: null,
    orderType: null,
    applyOnPaymentStatus: null,
    applyOnDeliveryStatus: null,
    delayDays: 0,
    isActive: true,
    scope: 'GLOBAL',
    orderFormId: null,
    message: 'Halo {nama}',
    metaParamMap: null,
    ...over,
  }
}

const baseOrder: MatchableOrder = {
  paymentMethod: 'TRANSFER',
  isDigitalOnly: false,
  paymentStatus: 'PENDING',
  deliveryStatus: 'PENDING',
  orderFormId: 'form-1',
  orderSessionId: null,
  invoiceNumber: 'INV-1',
  totalRp: 150000,
  items: [{ name: 'Kaos', qty: 1, price: 150000 }],
}

function order(over: Partial<MatchableOrder> = {}): MatchableOrder {
  return { ...baseOrder, ...over }
}

function ids(list: readonly MatchableTemplate[]): string[] {
  return list.map((t) => t.id)
}

// Order Sales Flow tipikal: tanpa invoice, total 0, items kosong.
function flowOrder(over: Partial<MatchableOrder> = {}): MatchableOrder {
  return order({
    orderSessionId: 'sess-1',
    orderFormId: null,
    invoiceNumber: null,
    totalRp: 0,
    items: [],
    ...over,
  })
}

console.log('followup-order-match: characterization (order non-flow)')

check('mapEventToTriggers sama dengan switch lama', () => {
  assert.deepEqual(mapEventToTriggers('ORDER_CREATED'), ['ORDER_CREATED', 'DAYS_AFTER_ORDER'])
  assert.deepEqual(mapEventToTriggers('PAYMENT_PAID'), ['PAYMENT_PAID', 'DAYS_AFTER_PAID'])
  assert.deepEqual(mapEventToTriggers('SHIPPED'), ['SHIPPED', 'DAYS_AFTER_SHIPPED'])
  assert.deepEqual(mapEventToTriggers('COMPLETED'), ['COMPLETED', 'DAYS_AFTER_DELIVERED'])
  assert.deepEqual(mapEventToTriggers('CANCELLED'), ['CANCELLED'])
  assert.equal(MAX_DELAY_DAYS, 30)
})

check('trigger difilter per event', () => {
  const list = [
    tpl({ id: 'oc', trigger: 'ORDER_CREATED' }),
    tpl({ id: 'dao', trigger: 'DAYS_AFTER_ORDER', delayDays: 1 }),
    tpl({ id: 'pp', trigger: 'PAYMENT_PAID' }),
    tpl({ id: 'lead', trigger: 'DAYS_AFTER_LIVE_LEAD' }),
  ]
  assert.deepEqual(ids(matchFollowUpTemplatesForOrder(list, order(), 'ORDER_CREATED')), ['oc', 'dao'])
  assert.deepEqual(ids(matchFollowUpTemplatesForOrder(list, order(), 'PAYMENT_PAID')), ['pp'])
  assert.deepEqual(ids(matchFollowUpTemplatesForOrder(list, order(), 'CANCELLED')), [])
})

check('event tak dikenal → kosong', () => {
  const list = [tpl({ id: 'a' })]
  const r = matchFollowUpTemplatesForOrder(list, order(), 'UNKNOWN' as never)
  assert.deepEqual(r, [])
})

check('isActive=false dibuang', () => {
  const list = [tpl({ id: 'on' }), tpl({ id: 'off', isActive: false })]
  assert.deepEqual(ids(matchFollowUpTemplatesForOrder(list, order(), 'ORDER_CREATED')), ['on'])
})

check('scope GLOBAL selalu; FORM hanya bila orderFormId sama', () => {
  const list = [
    tpl({ id: 'g', scope: 'GLOBAL', orderFormId: 'lain' }),
    tpl({ id: 'f-same', scope: 'FORM', orderFormId: 'form-1' }),
    tpl({ id: 'f-other', scope: 'FORM', orderFormId: 'form-2' }),
    tpl({ id: 'f-null', scope: 'FORM', orderFormId: null }),
    tpl({ id: 'x', scope: 'WEIRD' }),
  ]
  assert.deepEqual(ids(matchFollowUpTemplatesForOrder(list, order(), 'ORDER_CREATED')), ['g', 'f-same'])
})

check('scope FORM + orderFormId null cocok order tanpa form (semantik Prisma IS NULL)', () => {
  const list = [
    tpl({ id: 'f-null', scope: 'FORM', orderFormId: null }),
    tpl({ id: 'f-1', scope: 'FORM', orderFormId: 'form-1' }),
  ]
  const r = matchFollowUpTemplatesForOrder(list, order({ orderFormId: null }), 'ORDER_CREATED')
  assert.deepEqual(ids(r), ['f-null'])
})

check('paymentMethod null = semua; beda = dibuang', () => {
  const list = [
    tpl({ id: 'all', paymentMethod: null }),
    tpl({ id: 'tf', paymentMethod: 'TRANSFER' }),
    tpl({ id: 'cod', paymentMethod: 'COD' }),
    tpl({ id: 'empty', paymentMethod: '' }),
  ]
  assert.deepEqual(
    ids(matchFollowUpTemplatesForOrder(list, order(), 'ORDER_CREATED')),
    ['all', 'tf', 'empty'],
  )
})

check('orderType DIGITAL/PHYSICAL vs isDigitalOnly', () => {
  const list = [
    tpl({ id: 'any', orderType: null }),
    tpl({ id: 'dig', orderType: 'DIGITAL' }),
    tpl({ id: 'phy', orderType: 'PHYSICAL' }),
  ]
  assert.deepEqual(ids(matchFollowUpTemplatesForOrder(list, order(), 'ORDER_CREATED')), ['any', 'phy'])
  assert.deepEqual(
    ids(matchFollowUpTemplatesForOrder(list, order({ isDigitalOnly: true }), 'ORDER_CREATED')),
    ['any', 'dig'],
  )
})

check('applyOnPaymentStatus / applyOnDeliveryStatus', () => {
  const list = [
    tpl({ id: 'p-ok', trigger: 'PAYMENT_PAID', applyOnPaymentStatus: 'PAID' }),
    tpl({ id: 'p-no', trigger: 'PAYMENT_PAID', applyOnPaymentStatus: 'PENDING' }),
    tpl({ id: 'd-ok', trigger: 'PAYMENT_PAID', applyOnDeliveryStatus: 'PROCESSING' }),
    tpl({ id: 'd-no', trigger: 'PAYMENT_PAID', applyOnDeliveryStatus: 'SHIPPED' }),
  ]
  const o = order({ paymentStatus: 'PAID', deliveryStatus: 'PROCESSING' })
  assert.deepEqual(ids(matchFollowUpTemplatesForOrder(list, o, 'PAYMENT_PAID')), ['p-ok', 'd-ok'])
})

check('delayDays di luar 0..30 dibuang', () => {
  const list = [
    tpl({ id: 'neg', trigger: 'DAYS_AFTER_ORDER', delayDays: -1 }),
    tpl({ id: 'zero', trigger: 'DAYS_AFTER_ORDER', delayDays: 0 }),
    tpl({ id: 'max', trigger: 'DAYS_AFTER_ORDER', delayDays: 30 }),
    tpl({ id: 'over', trigger: 'DAYS_AFTER_ORDER', delayDays: 31 }),
  ]
  assert.deepEqual(ids(matchFollowUpTemplatesForOrder(list, order(), 'ORDER_CREATED')), ['zero', 'max'])
})

check('non-flow: data order kosong & metode BOOKING TIDAK kena guard (identik lama)', () => {
  const list = [
    tpl({ id: 'oc', message: 'Inv {invoice} {invoice_url} total {total}\n{produk}' }),
    tpl({ id: 'dao', trigger: 'DAYS_AFTER_ORDER', delayDays: 1, metaParamMap: ['{total}'] }),
  ]
  const o = order({ paymentMethod: 'BOOKING', invoiceNumber: null, totalRp: 0, items: [] })
  assert.deepEqual(ids(matchFollowUpTemplatesForOrder(list, o, 'ORDER_CREATED')), ['oc', 'dao'])
})

check('urutan input dipertahankan & input tidak dimutasi', () => {
  const list = [tpl({ id: 'b' }), tpl({ id: 'a', isActive: false }), tpl({ id: 'c' })]
  const snapshot = JSON.stringify(list)
  const r = matchFollowUpTemplatesForOrder(list, order(), 'ORDER_CREATED')
  assert.deepEqual(ids(r), ['b', 'c'])
  assert.notEqual(r, list)
  assert.equal(JSON.stringify(list), snapshot)
  // Objek template dikembalikan apa adanya (engine butuh field lain).
  assert.equal(r[0], list[0])
})

console.log('followup-order-match: guard order Sales Flow')

check('flow: ORDER_CREATED dilewati, DAYS_AFTER_ORDER tetap (TRANSFER)', () => {
  const list = [
    tpl({ id: 'oc', trigger: 'ORDER_CREATED' }),
    tpl({ id: 'dao', trigger: 'DAYS_AFTER_ORDER', delayDays: 1 }),
  ]
  assert.deepEqual(ids(matchFollowUpTemplatesForOrder(list, flowOrder(), 'ORDER_CREATED')), ['dao'])
})

check('flow: COD tetap dapat DAYS_AFTER_ORDER', () => {
  const list = [tpl({ id: 'dao', trigger: 'DAYS_AFTER_ORDER', delayDays: 2 })]
  const r = matchFollowUpTemplatesForOrder(list, flowOrder({ paymentMethod: 'COD' }), 'ORDER_CREATED')
  assert.deepEqual(ids(r), ['dao'])
})

check('flow: BOOKING/CONSULTATION/FREE lewati ORDER_CREATED & DAYS_AFTER_ORDER', () => {
  const list = [
    tpl({ id: 'oc', trigger: 'ORDER_CREATED' }),
    tpl({ id: 'dao', trigger: 'DAYS_AFTER_ORDER', delayDays: 1 }),
    tpl({ id: 'pp', trigger: 'PAYMENT_PAID' }),
  ]
  for (const pm of ['BOOKING', 'CONSULTATION', 'FREE']) {
    const o = flowOrder({ paymentMethod: pm })
    assert.deepEqual(ids(matchFollowUpTemplatesForOrder(list, o, 'ORDER_CREATED')), [], pm)
    assert.deepEqual(ids(matchFollowUpTemplatesForOrder(list, o, 'PAYMENT_PAID')), ['pp'], pm)
  }
})

// Guard placeholder (c) HANYA untuk tahap order (DAYS_AFTER_ORDER; ORDER_CREATED
// sudah dilewati guard a) — jalur baru yang dibuka flow-engine. Event lanjutan
// (PAYMENT_PAID/SHIPPED/COMPLETED) memakai perilaku lama.
function dao(id: string, message: string, over: Partial<MatchableTemplate> = {}): MatchableTemplate {
  return tpl({ id, trigger: 'DAYS_AFTER_ORDER', delayDays: 1, message, ...over })
}

check('flow: {invoice} / {invoice_url} dilewati di tahap order bila invoiceNumber kosong', () => {
  const list = [
    dao('inv', 'Invoice {invoice}'),
    dao('url', 'Cek {invoice_url}'),
    dao('nama', 'Halo {nama}'),
  ]
  assert.deepEqual(ids(matchFollowUpTemplatesForOrder(list, flowOrder(), 'ORDER_CREATED')), ['nama'])
  assert.deepEqual(
    ids(matchFollowUpTemplatesForOrder(list, flowOrder({ invoiceNumber: '' }), 'ORDER_CREATED')),
    ['nama'],
  )
  assert.deepEqual(
    ids(matchFollowUpTemplatesForOrder(list, flowOrder({ invoiceNumber: 'INV-9' }), 'ORDER_CREATED')),
    ['inv', 'url', 'nama'],
  )
})

check('flow: {total} dilewati di tahap order bila totalRp 0/null', () => {
  const list = [dao('tot', 'Total {total}')]
  assert.deepEqual(ids(matchFollowUpTemplatesForOrder(list, flowOrder(), 'ORDER_CREATED')), [])
  assert.deepEqual(
    ids(matchFollowUpTemplatesForOrder(list, flowOrder({ totalRp: null }), 'ORDER_CREATED')),
    [],
  )
  assert.deepEqual(
    ids(matchFollowUpTemplatesForOrder(list, flowOrder({ totalRp: 50000 }), 'ORDER_CREATED')),
    ['tot'],
  )
})

check('flow: {produk} dilewati di tahap order bila items kosong/bukan array', () => {
  const list = [dao('pr', 'Pesanan:\n{produk}')]
  assert.deepEqual(ids(matchFollowUpTemplatesForOrder(list, flowOrder(), 'ORDER_CREATED')), [])
  assert.deepEqual(
    ids(matchFollowUpTemplatesForOrder(list, flowOrder({ items: null }), 'ORDER_CREATED')),
    [],
  )
  const withItems = flowOrder({ items: [{ name: 'A', qty: 1, price: 1000 }] })
  assert.deepEqual(ids(matchFollowUpTemplatesForOrder(list, withItems, 'ORDER_CREATED')), ['pr'])
})

check('flow: placeholder di metaParamMap ikut dicek (tahap order)', () => {
  const list = [
    dao('meta', 'Halo {nama}', { metaParamMap: ['{nama}', '{total}'] }),
    dao('meta-ok', 'Halo {nama}', { metaParamMap: ['{nama}', '{nama_toko}'] }),
    dao('meta-bad-shape', 'Halo {nama}', { metaParamMap: { a: '{total}' } }),
  ]
  assert.deepEqual(
    ids(matchFollowUpTemplatesForOrder(list, flowOrder(), 'ORDER_CREATED')),
    ['meta-ok', 'meta-bad-shape'],
  )
})

check('flow: {produk_minat} bukan {produk}', () => {
  const list = [dao('pm', 'Minat {produk_minat}')]
  assert.deepEqual(ids(matchFollowUpTemplatesForOrder(list, flowOrder(), 'ORDER_CREATED')), ['pm'])
})

// Characterization: template default (followup-defaults) semuanya memakai
// {invoice}/{total}. Sebelum flow-engine generate ORDER_CREATED, jalur PATCH /
// bulk-update / order-auto-paid / confirm-received SUDAH meng-queue template
// ini untuk order flow — guard tidak boleh memutusnya (regresi review).
check('flow: event lanjutan tetap match walau pakai {invoice}/{total}/{produk}', () => {
  const cases: Array<[FollowupEvent, MatchableTemplate]> = [
    ['PAYMENT_PAID', tpl({ id: 'pp', trigger: 'PAYMENT_PAID', message: 'Pembayaran {invoice} sebesar {total} diterima.\n{produk}' })],
    ['PAYMENT_PAID', tpl({ id: 'dap', trigger: 'DAYS_AFTER_PAID', delayDays: 1, message: 'Pesanan {invoice}' })],
    ['SHIPPED', tpl({ id: 'sh', trigger: 'SHIPPED', message: 'Pesanan {invoice} dikirim via {kurir}. Resi {resi}' })],
    ['SHIPPED', tpl({ id: 'das', trigger: 'DAYS_AFTER_SHIPPED', delayDays: 3, message: 'Pesanan {invoice} {link_terima}' })],
    ['COMPLETED', tpl({ id: 'dad', trigger: 'DAYS_AFTER_DELIVERED', delayDays: 5, message: 'Pesanan {invoice} {link_review}' })],
    ['CANCELLED', tpl({ id: 'cx', trigger: 'CANCELLED', message: 'Pesanan {invoice} dibatalkan' })],
  ]
  for (const [event, t] of cases) {
    assert.deepEqual(ids(matchFollowUpTemplatesForOrder([t], flowOrder(), event)), [t.id], `${event}/${t.id}`)
  }
})

check('flow: filter lama tetap berlaku (isActive, paymentMethod)', () => {
  const list = [
    tpl({ id: 'off', trigger: 'PAYMENT_PAID', isActive: false }),
    tpl({ id: 'cod', trigger: 'PAYMENT_PAID', paymentMethod: 'COD' }),
    tpl({ id: 'ok', trigger: 'PAYMENT_PAID' }),
  ]
  assert.deepEqual(ids(matchFollowUpTemplatesForOrder(list, flowOrder(), 'PAYMENT_PAID')), ['ok'])
})

console.log(`\n${passed} test lulus`)
