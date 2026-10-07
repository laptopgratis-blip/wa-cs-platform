// Uji keputusan template per kandidat sesi Cloud. Jalankan lewat `npm test`.
// Kasus nyata ARLI (2026-10): follow-up masih tertaut ke template WABA lama,
// pengiriman lewat WABA baru → harus fallback ke padanan purposeKey.
import assert from 'node:assert/strict'

import {
  decideTemplateForCandidate,
  isPermanentCloudCode,
  isTransientTemplateStatus,
  type ResolvableTemplate,
  type TemplateResolutionInput,
} from './template-resolution'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const OLD_WABA = '103224236140654'
const NEW_WABA = '117423901366474'
const BODY3 = 'Halo {{1}}, pesanan {{2}} senilai {{3}} sudah kami terima.'

function tpl(over: Partial<ResolvableTemplate>): ResolvableTemplate {
  return {
    id: 't',
    userId: 'u1',
    wabaId: NEW_WABA,
    status: 'APPROVED',
    purposeKey: 'FOLLOWUP_ORDER_MASUK_COD',
    name: 'hulao_order_masuk_cod',
    language: 'id',
    category: 'UTILITY',
    bodyText: BODY3,
    ...over,
  }
}

const linkedOld = tpl({ id: 'old1', wabaId: OLD_WABA })

function input(over: Partial<TemplateResolutionInput>): TemplateResolutionInput {
  return {
    candidateWabaId: NEW_WABA,
    templateId: 'old1',
    purposeKey: null,
    fallbackFromLinked: true,
    paramCount: 3,
    linked: linkedOld,
    wabaTemplates: [],
    ...over,
  }
}

console.log('wa-send/template-resolution: decideTemplateForCandidate')

check('ARLI: linked WABA lama → padanan purposeKey APPROVED di WABA baru', () => {
  const d = decideTemplateForCandidate(input({ wabaTemplates: [tpl({ id: 'new1' })] }))
  assert.deepEqual(d, { ok: true, templateId: 'new1', via: 'PURPOSE' })
})

check('linked di WABA kandidat & APPROVED → LINKED', () => {
  const linked = tpl({ id: 'same1' })
  const d = decideTemplateForCandidate(input({ templateId: 'same1', linked, wabaTemplates: [linked] }))
  assert.deepEqual(d, { ok: true, templateId: 'same1', via: 'LINKED' })
})

check('purposeKey diutamakan di atas name match', () => {
  const byName = tpl({ id: 'byName', purposeKey: null })
  const byPurpose = tpl({ id: 'byPurpose', name: 'nama_lain' })
  const d = decideTemplateForCandidate(input({ wabaTemplates: [byName, byPurpose] }))
  assert.equal(d.ok && d.templateId, 'byPurpose')
})

check('jumlah variabel beda → gagal permanen dengan alasan variabel', () => {
  const d = decideTemplateForCandidate(
    input({ wabaTemplates: [tpl({ id: 'new1', bodyText: 'Halo {{1}} {{2}}' })] }),
  )
  assert.equal(d.ok, false)
  if (d.ok) return
  assert.equal(d.reason, 'NO_TEMPLATE')
  assert.equal(d.permanent, true)
  assert.match(d.message, /2 variabel/)
  assert.match(d.message, /3/)
})

check('padanan masih DRAFT → gagal permanen, sebut DRAFT', () => {
  const d = decideTemplateForCandidate(
    input({ wabaTemplates: [tpl({ id: 'new1', status: 'DRAFT' })] }),
  )
  assert.equal(d.ok, false)
  if (d.ok) return
  assert.equal(d.permanent, true)
  assert.match(d.message, /DRAFT/)
})

check('padanan PENDING → gagal transient (dicoba lagi)', () => {
  const d = decideTemplateForCandidate(
    input({ wabaTemplates: [tpl({ id: 'new1', status: 'PENDING' })] }),
  )
  assert.equal(d.ok, false)
  if (d.ok) return
  assert.equal(d.permanent, false)
})

check('linked di WABA kandidat tapi PENDING (opt-in) → transient', () => {
  const linked = tpl({ id: 'same1', status: 'PENDING' })
  const d = decideTemplateForCandidate(input({ templateId: 'same1', linked, wabaTemplates: [linked] }))
  assert.equal(d.ok, false)
  if (d.ok) return
  assert.equal(d.permanent, false)
})

check('tanpa padanan sama sekali → permanen, sebut WABA lain & pilih ulang', () => {
  const d = decideTemplateForCandidate(input({ wabaTemplates: [] }))
  assert.equal(d.ok, false)
  if (d.ok) return
  assert.equal(d.permanent, true)
  assert.match(d.message, /hulao_order_masuk_cod/)
  assert.match(d.message, /pilih ulang/i)
})

check('custom (purposeKey null): name+language sama, var sama, owner sama → NAME', () => {
  const linked = tpl({ id: 'old1', wabaId: OLD_WABA, purposeKey: null, name: 'pesananbanktransfer' })
  const match = tpl({ id: 'new1', purposeKey: null, name: 'pesananbanktransfer' })
  const d = decideTemplateForCandidate(input({ linked, wabaTemplates: [match] }))
  assert.deepEqual(d, { ok: true, templateId: 'new1', via: 'NAME' })
})

check('custom: owner berbeda → tidak dipakai', () => {
  const linked = tpl({ id: 'old1', wabaId: OLD_WABA, purposeKey: null, name: 'pesananbanktransfer' })
  const match = tpl({ id: 'new1', purposeKey: null, name: 'pesananbanktransfer', userId: 'u2' })
  const d = decideTemplateForCandidate(input({ linked, wabaTemplates: [match] }))
  assert.equal(d.ok, false)
})

check('custom: bahasa beda → tidak dipakai', () => {
  const linked = tpl({ id: 'old1', wabaId: OLD_WABA, purposeKey: null, name: 'promo' })
  const match = tpl({ id: 'new1', purposeKey: null, name: 'promo', language: 'en' })
  assert.equal(decideTemplateForCandidate(input({ linked, wabaTemplates: [match] })).ok, false)
})

check('template linked sudah tidak ada (null) → permanen', () => {
  const d = decideTemplateForCandidate(input({ linked: null }))
  assert.equal(d.ok, false)
  if (d.ok) return
  assert.equal(d.permanent, true)
})

check('template WABA kandidat lain tidak ikut dipertimbangkan', () => {
  const foreign = tpl({ id: 'x', wabaId: '999' })
  assert.equal(decideTemplateForCandidate(input({ wabaTemplates: [foreign] })).ok, false)
})

console.log('wa-send/template-resolution: spec non-opt-in (perilaku lama terkunci)')

check('templateId-only lintas WABA (sendPublicTemplate) → gagal, tanpa fallback', () => {
  const d = decideTemplateForCandidate(
    input({ fallbackFromLinked: false, wabaTemplates: [tpl({ id: 'new1' })] }),
  )
  assert.equal(d.ok, false)
  if (d.ok) return
  assert.equal(d.reason, 'NO_TEMPLATE')
  assert.equal(d.message, 'template belum APPROVED di WABA ini')
})

check('templateId sama WABA walau belum APPROVED → tetap dipakai (status dicek sendCloudTemplate)', () => {
  const linked = tpl({ id: 'same1', status: 'PENDING' })
  const d = decideTemplateForCandidate(
    input({ fallbackFromLinked: false, templateId: 'same1', linked, wabaTemplates: [] }),
  )
  assert.deepEqual(d, { ok: true, templateId: 'same1', via: 'LINKED' })
})

check('purposeKey INFO_GENERIC APPROVED → PURPOSE tanpa cek jumlah variabel', () => {
  const generic = tpl({ id: 'g1', purposeKey: 'INFO_GENERIC', bodyText: 'Hai {{1}}' })
  const d = decideTemplateForCandidate({
    candidateWabaId: NEW_WABA,
    purposeKey: 'INFO_GENERIC',
    paramCount: 3,
    linked: null,
    wabaTemplates: [generic],
  })
  assert.deepEqual(d, { ok: true, templateId: 'g1', via: 'PURPOSE' })
})

check('purposeKey AUTH_OTP tidak ada → pesan lama tanpa spasi dobel', () => {
  const d = decideTemplateForCandidate({
    candidateWabaId: NEW_WABA,
    purposeKey: 'AUTH_OTP',
    paramCount: 1,
    linked: null,
    wabaTemplates: [tpl({ id: 'p', purposeKey: 'AUTH_OTP', status: 'PENDING' })],
  })
  assert.equal(d.ok, false)
  if (d.ok) return
  assert.equal(d.message, 'template "AUTH_OTP" belum APPROVED di WABA ini')
  assert.equal(d.message.includes('  '), false)
})

check('non-opt-in: purposeKey dari template linked TIDAK dipakai', () => {
  const d = decideTemplateForCandidate(
    input({ fallbackFromLinked: undefined, wabaTemplates: [tpl({ id: 'new1' })] }),
  )
  assert.equal(d.ok, false)
})

console.log('wa-send/template-resolution: klasifikasi status & kode')

check('isTransientTemplateStatus', () => {
  assert.equal(isTransientTemplateStatus('PENDING'), true)
  assert.equal(isTransientTemplateStatus('IN_APPEAL'), true)
  assert.equal(isTransientTemplateStatus('PAUSED'), true)
  assert.equal(isTransientTemplateStatus('DRAFT'), false)
  assert.equal(isTransientTemplateStatus('REJECTED'), false)
  assert.equal(isTransientTemplateStatus('DELETED'), false)
})

check('isPermanentCloudCode', () => {
  assert.equal(isPermanentCloudCode('TEMPLATE_PARAM_MISMATCH'), true)
  assert.equal(isPermanentCloudCode('TEMPLATE_WABA_MISMATCH'), true)
  assert.equal(isPermanentCloudCode('BLACKLISTED'), true)
  assert.equal(isPermanentCloudCode('MARKETING_OPT_OUT'), true)
  assert.equal(isPermanentCloudCode('RATE_LIMIT'), false)
  assert.equal(isPermanentCloudCode('META_ERROR'), false)
  // Gangguan sementara menyiapkan media header → follow-up di-retry.
  assert.equal(isPermanentCloudCode('HEADER_MEDIA_TEMPORARY'), false)
  assert.equal(isPermanentCloudCode('INSUFFICIENT_CREDIT'), false)
  assert.equal(isPermanentCloudCode(undefined), false)
})

console.log(`wa-send/template-resolution: ${passed} ok`)
