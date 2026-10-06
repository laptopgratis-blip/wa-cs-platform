// Uji helper pure tautan FollowUpTemplate ⇄ WabaTemplate. `npm test`.
// Bentuk data meniru kasus ARLI (2026-10): 11 follow-up masih tertaut ke
// WABA lama, WABA baru punya padanan purposeKey (9 APPROVED + 2 DRAFT).
import assert from 'node:assert/strict'

import {
  followUpLinkIssue,
  pickRelinkTarget,
  planRelinkParamMap,
  planRelinks,
  validateFollowUpMetaLink,
  type MetaLinkTemplate,
  type MetaTemplateLite,
  type RelinkFollowUpRow,
} from './followup-meta-link'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const OLD_WABA = '103224236140654'
const NEW_WABA = '117423901366474'

function body(n: number): string {
  return Array.from({ length: n }, (_, i) => `v{{${i + 1}}}`).join(' ') + ' selesai.'
}

function tpl(over: Partial<MetaTemplateLite> & { id: string }): MetaTemplateLite {
  return {
    userId: 'arli',
    wabaId: NEW_WABA,
    status: 'APPROVED',
    purposeKey: null,
    name: over.id,
    language: 'id',
    category: 'UTILITY',
    bodyText: body(3),
    ...over,
  }
}

// purposeKey → jumlah variabel (sesuai starter pack).
const APPROVED_KEYS: [string, number][] = [
  ['FOLLOWUP_ORDER_MASUK_COD', 7],
  ['FOLLOWUP_ORDER_MASUK_TRANSFER', 7],
  ['FOLLOWUP_REMINDER_BAYAR', 4],
  ['FOLLOWUP_PESANAN_DIKIRIM', 5],
  ['FOLLOWUP_KONFIRMASI_SAMPAI', 3],
  ['FOLLOWUP_MINTA_ULASAN', 4],
  ['FOLLOWUP_PESANAN_DIBATALKAN', 3],
  ['FOLLOWUP_LEAD_LIVE', 4],
]
const DRAFT_KEYS: [string, number][] = [
  ['FOLLOWUP_PEMBAYARAN_DITERIMA', 4],
  ['FOLLOWUP_PEMBAYARAN_DITERIMA_DIGITAL', 4],
]

const oldTemplates: MetaTemplateLite[] = [
  ...APPROVED_KEYS.map(([k, n]) =>
    tpl({ id: `old_${k}`, wabaId: OLD_WABA, purposeKey: k, name: k.toLowerCase(), bodyText: body(n) }),
  ),
  ...DRAFT_KEYS.map(([k, n]) =>
    tpl({ id: `old_${k}`, wabaId: OLD_WABA, purposeKey: k, name: k.toLowerCase(), bodyText: body(n), status: 'DELETED' }),
  ),
]
const newTemplates: MetaTemplateLite[] = [
  ...APPROVED_KEYS.map(([k, n]) =>
    tpl({ id: `new_${k}`, purposeKey: k, name: k.toLowerCase(), bodyText: body(n) }),
  ),
  ...DRAFT_KEYS.map(([k, n]) =>
    tpl({ id: `new_${k}`, purposeKey: k, name: k.toLowerCase(), bodyText: body(n), status: 'DRAFT' }),
  ),
]

function mapFor(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `{p${i + 1}}`)
}

// 11 follow-up: ORDER_MASUK_TRANSFER dipakai dua follow-up (TRANSFER & null).
const arliFollowUps: RelinkFollowUpRow[] = [
  ...oldTemplates.map((t, i) => ({
    id: `fu_${i}`,
    name: `Follow-up ${t.purposeKey}`,
    metaParamMap: mapFor(Number(t.bodyText.match(/\{\{/g)?.length ?? 0)),
    metaTemplate: t,
  })),
  {
    id: 'fu_transfer_null',
    name: 'Order masuk (semua metode)',
    metaParamMap: mapFor(7),
    metaTemplate: oldTemplates[1],
  },
]

console.log('followup-meta-link: followUpLinkIssue')

check('tanpa tautan → null', () => {
  assert.equal(followUpLinkIssue(null, [NEW_WABA]), null)
})
check('tertaut WABA aktif & APPROVED → null', () => {
  assert.equal(followUpLinkIssue({ wabaId: NEW_WABA, status: 'APPROVED' }, [NEW_WABA]), null)
})
check('tertaut WABA aktif & DRAFT/PENDING → null (bukan basi)', () => {
  assert.equal(followUpLinkIssue({ wabaId: NEW_WABA, status: 'DRAFT' }, [NEW_WABA]), null)
  assert.equal(followUpLinkIssue({ wabaId: NEW_WABA, status: 'PENDING' }, [NEW_WABA]), null)
})
check('tertaut WABA lama → WABA_INACTIVE', () => {
  assert.equal(followUpLinkIssue({ wabaId: OLD_WABA, status: 'APPROVED' }, [NEW_WABA]), 'WABA_INACTIVE')
})
check('template DELETED/REJECTED/DISABLED → TEMPLATE_UNUSABLE', () => {
  for (const status of ['DELETED', 'REJECTED', 'DISABLED']) {
    assert.equal(followUpLinkIssue({ wabaId: NEW_WABA, status }, [NEW_WABA]), 'TEMPLATE_UNUSABLE')
  }
})
check('tanpa WABA aktif → tidak bisa dinilai (null) kecuali template rusak', () => {
  assert.equal(followUpLinkIssue({ wabaId: OLD_WABA, status: 'APPROVED' }, []), null)
  assert.equal(followUpLinkIssue({ wabaId: OLD_WABA, status: 'DELETED' }, []), 'TEMPLATE_UNUSABLE')
})

console.log('followup-meta-link: pickRelinkTarget')

check('rank APPROVED > PENDING > PAUSED > DRAFT', () => {
  const current = oldTemplates[0]
  const mk = (id: string, status: string) =>
    tpl({ id, purposeKey: current.purposeKey, bodyText: current.bodyText, status })
  const r = pickRelinkTarget(current, [mk('d', 'DRAFT'), mk('p', 'PAUSED'), mk('pe', 'PENDING'), mk('a', 'APPROVED')], [NEW_WABA])
  assert.equal(r.ok && r.target.id, 'a')
  const r2 = pickRelinkTarget(current, [mk('d', 'DRAFT'), mk('p', 'PAUSED'), mk('pe', 'IN_APPEAL')], [NEW_WABA])
  assert.equal(r2.ok && r2.target.id, 'pe')
  const r3 = pickRelinkTarget(current, [mk('d', 'DRAFT'), mk('p', 'PAUSED')], [NEW_WABA])
  assert.equal(r3.ok && r3.target.id, 'p')
})
check('tidak pernah memilih DELETED/REJECTED/DISABLED', () => {
  const current = oldTemplates[0]
  const bad = ['DELETED', 'REJECTED', 'DISABLED'].map((status) =>
    tpl({ id: status, purposeKey: current.purposeKey, bodyText: current.bodyText, status }),
  )
  assert.equal(pickRelinkTarget(current, bad, [NEW_WABA]).ok, false)
})
check('kandidat di luar WABA aktif diabaikan', () => {
  const current = oldTemplates[0]
  const other = tpl({ id: 'x', wabaId: '999', purposeKey: current.purposeKey, bodyText: current.bodyText })
  assert.equal(pickRelinkTarget(current, [other], [NEW_WABA]).ok, false)
})
check('purposeKey diutamakan di atas nama', () => {
  const current = tpl({ id: 'c', wabaId: OLD_WABA, purposeKey: 'K', name: 'nama_sama' })
  const byName = tpl({ id: 'byName', name: 'nama_sama' })
  const byPurpose = tpl({ id: 'byPurpose', purposeKey: 'K', name: 'lain' })
  const r = pickRelinkTarget(current, [byName, byPurpose], [NEW_WABA])
  assert.equal(r.ok && r.via, 'PURPOSE')
  assert.equal(r.ok && r.target.id, 'byPurpose')
})
check('custom (purposeKey null): name+language sama & var sama → NAME', () => {
  const current = tpl({ id: 'c', wabaId: OLD_WABA, name: 'pesananbanktransfer', bodyText: body(4) })
  const match = tpl({ id: 'm', name: 'pesananbanktransfer', bodyText: body(4) })
  const r = pickRelinkTarget(current, [match], [NEW_WABA])
  assert.equal(r.ok && r.via, 'NAME')
})
check('custom: jumlah variabel beda → tidak bisa, alasan menyebut variabel', () => {
  const current = tpl({ id: 'c', wabaId: OLD_WABA, name: 'pesananbanktransfer', bodyText: body(4) })
  const match = tpl({ id: 'm', name: 'pesananbanktransfer', bodyText: body(3) })
  const r = pickRelinkTarget(current, [match], [NEW_WABA])
  assert.equal(r.ok, false)
  assert.match(r.ok ? '' : r.reason, /variabel/)
})
check('custom: pemilik lain → tidak dipakai', () => {
  const current = tpl({ id: 'c', wabaId: OLD_WABA, name: 'promo' })
  const match = tpl({ id: 'm', name: 'promo', userId: 'orang_lain' })
  assert.equal(pickRelinkTarget(current, [match], [NEW_WABA]).ok, false)
})

console.log('followup-meta-link: planRelinkParamMap')

check('peta lama dipertahankan bila panjang cocok', () => {
  const target = tpl({ id: 't', bodyText: body(3) })
  assert.deepEqual(planRelinkParamMap({ currentMap: ['{a}', '{b}', '{c}'], target }), ['{a}', '{b}', '{c}'])
})
check('peta lama tidak cocok → pakai peta starter', () => {
  const target = tpl({ id: 't', bodyText: body(2) })
  assert.deepEqual(
    planRelinkParamMap({ currentMap: ['{a}'], target, starterMap: ['{nama}', '{invoice}'] }),
    ['{nama}', '{invoice}'],
  )
})
check('0 variabel → []', () => {
  assert.deepEqual(planRelinkParamMap({ currentMap: null, target: tpl({ id: 't', bodyText: 'Halo.' }) }), [])
})
check('tidak ada peta valid → null', () => {
  assert.equal(planRelinkParamMap({ currentMap: 'x', target: tpl({ id: 't', bodyText: body(2) }) }), null)
})

console.log('followup-meta-link: planRelinks (kasus ARLI)')

check('ARLI: 11 follow-up → 11 perubahan ke WABA baru (9 APPROVED + 2 DRAFT)', () => {
  assert.equal(arliFollowUps.length, 11)
  const plan = planRelinks({
    followUps: arliFollowUps,
    candidates: newTemplates,
    activeWabaIds: [NEW_WABA],
  })
  assert.equal(plan.changes.length, 11)
  assert.equal(plan.unresolved.length, 0)
  assert.ok(plan.changes.every((c) => c.to.wabaId === NEW_WABA))
  assert.equal(plan.changes.filter((c) => c.to.status === 'APPROVED').length, 9)
  assert.equal(plan.changes.filter((c) => c.to.status === 'DRAFT').length, 2)
  const draftKeys = plan.changes.filter((c) => c.to.status === 'DRAFT').map((c) => c.to.name).sort()
  assert.deepEqual(draftKeys, ['followup_pembayaran_diterima', 'followup_pembayaran_diterima_digital'])
  // Peta variabel lama dipertahankan (jumlah variabel sama).
  const cod = plan.changes.find((c) => c.followUpTemplateId === 'fu_0')
  assert.deepEqual(cod?.paramMap, mapFor(7))
  assert.equal(cod?.from.wabaId, OLD_WABA)
  assert.ok(cod?.reason.length)
})
check('tanpa WABA aktif → tidak ada rencana (no-op)', () => {
  const plan = planRelinks({ followUps: arliFollowUps, candidates: newTemplates, activeWabaIds: [] })
  assert.deepEqual(plan, { changes: [], unresolved: [] })
})
check('tautan sehat tidak disentuh', () => {
  const healthy: RelinkFollowUpRow = {
    id: 'ok',
    name: 'Sehat',
    metaParamMap: mapFor(7),
    metaTemplate: newTemplates[0],
  }
  const plan = planRelinks({ followUps: [healthy], candidates: newTemplates, activeWabaIds: [NEW_WABA] })
  assert.deepEqual(plan, { changes: [], unresolved: [] })
})
check('tanpa padanan → masuk unresolved dengan alasan', () => {
  const plan = planRelinks({ followUps: arliFollowUps.slice(0, 1), candidates: [], activeWabaIds: [NEW_WABA] })
  assert.equal(plan.changes.length, 0)
  assert.equal(plan.unresolved.length, 1)
  assert.ok(plan.unresolved[0].reason.length > 0)
})

console.log('followup-meta-link: validateFollowUpMetaLink')

// Template custom seller ARLI (body nyata, {{2}} dipakai dua kali → 4 variabel).
const BANK_TRANSFER: MetaLinkTemplate = {
  name: 'pesananbanktransfer',
  language: 'id',
  category: 'UTILITY',
  status: 'APPROVED',
  bodyText:
    'Halo kak {{1}}! Terima kasih sudah order {{2}}. Pesanan: {{3}} {{2}} Total Bayar: {{4}}',
  headerType: null,
  buttons: null,
}

check('pesananbanktransfer: peta 4 entri sah → ok', () => {
  const r = validateFollowUpMetaLink({
    template: BANK_TRANSFER,
    paramMap: ['{nama}', '{produk}', '{invoice}', '{total}'],
    trigger: 'ORDER_CREATED',
  })
  assert.deepEqual(r, { ok: true, paramMap: ['{nama}', '{produk}', '{invoice}', '{total}'] })
})
check('pesananbanktransfer: peta 3 atau 5 entri → ditolak', () => {
  for (const paramMap of [['{nama}', '{produk}', '{invoice}'], ['{nama}', '{produk}', '{invoice}', '{total}', '{etd}']]) {
    const r = validateFollowUpMetaLink({ template: BANK_TRANSFER, paramMap, trigger: 'ORDER_CREATED' })
    assert.equal(r.ok, false)
    assert.match(r.ok ? '' : r.error, /4/)
  }
})
check('entri kosong ditolak', () => {
  const r = validateFollowUpMetaLink({
    template: BANK_TRANSFER,
    paramMap: ['{nama}', ' ', '{invoice}', '{total}'],
    trigger: 'ORDER_CREATED',
  })
  assert.equal(r.ok, false)
})
check('teks literal + token boleh, token asing ditolak', () => {
  const ok = validateFollowUpMetaLink({
    template: BANK_TRANSFER,
    paramMap: ['Kak {nama}', '{produk}', '{invoice}', 'Rp {total}'],
    trigger: 'ORDER_CREATED',
  })
  assert.equal(ok.ok, true)
  const bad = validateFollowUpMetaLink({
    template: BANK_TRANSFER,
    paramMap: ['{nama}', '{produk}', '{invoice}', '{harga}'],
    trigger: 'ORDER_CREATED',
  })
  assert.equal(bad.ok, false)
  assert.match(bad.ok ? '' : bad.error, /\{harga\}/)
})
check('entri > 64 karakter ditolak', () => {
  const r = validateFollowUpMetaLink({
    template: BANK_TRANSFER,
    paramMap: ['{nama}', '{produk}', '{invoice}', 'x'.repeat(65)],
    trigger: 'ORDER_CREATED',
  })
  assert.equal(r.ok, false)
})
check('trigger lead menolak {invoice}', () => {
  const r = validateFollowUpMetaLink({
    template: BANK_TRANSFER,
    paramMap: ['{nama}', '{produk_minat}', '{invoice}', '{link_order}'],
    trigger: 'DAYS_AFTER_LIVE_LEAD',
  })
  assert.equal(r.ok, false)
  assert.match(r.ok ? '' : r.error, /\{invoice\}/)
})
check('trigger lead menerima placeholder lead', () => {
  const r = validateFollowUpMetaLink({
    template: BANK_TRANSFER,
    paramMap: ['{nama}', '{produk_minat}', '{nama_toko}', '{link_order}'],
    trigger: 'DAYS_AFTER_LIVE_LEAD',
  })
  assert.equal(r.ok, true)
})
check('header TEXT bervariabel → tidak didukung', () => {
  const r = validateFollowUpMetaLink({
    template: { ...BANK_TRANSFER, headerType: 'TEXT', headerText: 'Pesanan {{1}}' },
    paramMap: ['{nama}', '{produk}', '{invoice}', '{total}'],
    trigger: 'ORDER_CREATED',
  })
  assert.equal(r.ok, false)
  assert.match(r.ok ? '' : r.error, /tidak didukung/)
})
check('tombol URL bervariabel → tidak didukung', () => {
  const r = validateFollowUpMetaLink({
    template: { ...BANK_TRANSFER, buttons: [{ type: 'URL', text: 'Lihat', url: 'https://x.id/{{1}}' }] },
    paramMap: ['{nama}', '{produk}', '{invoice}', '{total}'],
    trigger: 'ORDER_CREATED',
  })
  assert.equal(r.ok, false)
})
check('header TEXT tanpa variabel & tombol quick reply → ok', () => {
  const r = validateFollowUpMetaLink({
    template: {
      ...BANK_TRANSFER,
      headerType: 'TEXT',
      headerText: 'Pesanan baru',
      buttons: [{ type: 'QUICK_REPLY', text: 'OK' }],
    },
    paramMap: ['{nama}', '{produk}', '{invoice}', '{total}'],
    trigger: 'ORDER_CREATED',
  })
  assert.equal(r.ok, true)
})
check('AUTHENTICATION ditolak', () => {
  const r = validateFollowUpMetaLink({
    template: { ...BANK_TRANSFER, category: 'AUTHENTICATION', bodyText: '' },
    paramMap: ['{nama}'],
    trigger: 'ORDER_CREATED',
  })
  assert.equal(r.ok, false)
})
check('DELETED/REJECTED/DISABLED ditolak', () => {
  for (const status of ['DELETED', 'REJECTED', 'DISABLED']) {
    const r = validateFollowUpMetaLink({
      template: { ...BANK_TRANSFER, status },
      paramMap: ['{nama}', '{produk}', '{invoice}', '{total}'],
      trigger: 'ORDER_CREATED',
    })
    assert.equal(r.ok, false, status)
  }
})
check('0 variabel → peta [] (null/[] diterima)', () => {
  const t = { ...BANK_TRANSFER, bodyText: 'Terima kasih sudah order.' }
  assert.deepEqual(validateFollowUpMetaLink({ template: t, paramMap: null, trigger: 'ORDER_CREATED' }), {
    ok: true,
    paramMap: [],
  })
  assert.deepEqual(validateFollowUpMetaLink({ template: t, paramMap: [], trigger: 'ORDER_CREATED' }), {
    ok: true,
    paramMap: [],
  })
})
check('peta null untuk template bervariabel → ditolak', () => {
  assert.equal(
    validateFollowUpMetaLink({ template: BANK_TRANSFER, paramMap: null, trigger: 'ORDER_CREATED' }).ok,
    false,
  )
})

console.log(`followup-meta-link: ${passed} ok`)
