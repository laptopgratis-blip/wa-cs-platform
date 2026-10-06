// Uji kebijakan gagal kirim follow-up (cron followup-send). `npm test`.
import assert from 'node:assert/strict'

import {
  FOLLOWUP_FAILURE_NOTIF_TYPE,
  MAX_SEND_RETRY,
  MAX_WA_RETRY,
  RETRY_BACKOFF_MS,
  WA_RECONNECT_BACKOFF_MS,
  buildFollowUpFailureNotification,
  decideFollowUpFailure,
  emptyParamPlaceholders,
  followUpTemplateLink,
  manualSendFailureStatus,
  type FollowUpFailureScope,
} from './followup-failure-policy'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const COMBINED = 'abc123/CLOUD_TEMPLATE: alasan mentah | def456/BAILEYS: x'

console.log('followup-failure-policy: decideFollowUpFailure')

check('NO_TEMPLATE permanen → FAIL_FINAL di percobaan pertama, pakai detail', () => {
  const d = decideFollowUpFailure({
    code: 'NO_TEMPLATE',
    permanent: true,
    detail: 'Template Meta "x" masih DRAFT',
    error: COMBINED,
    retryCount: 0,
  })
  assert.deepEqual(d, { action: 'FAIL_FINAL', reason: 'Template Meta "x" masih DRAFT', scope: 'TEMPLATE' })
})

check('NO_TEMPLATE transient → RETRY 30 mnt dengan alasan', () => {
  const d = decideFollowUpFailure({
    code: 'NO_TEMPLATE',
    permanent: false,
    detail: 'menunggu review',
    error: COMBINED,
    retryCount: 2,
  })
  assert.deepEqual(d, { action: 'RETRY', reason: 'menunggu review', backoffMs: WA_RECONNECT_BACKOFF_MS })
})

check('NO_TEMPLATE transient tapi retry habis → FAIL_FINAL, alasan tidak lagi bilang "dicoba lagi"', () => {
  const d = decideFollowUpFailure({
    code: 'NO_TEMPLATE',
    detail: 'Template Meta "hulao_order_masuk_cod" menunggu review Meta — follow-up dicoba lagi otomatis',
    retryCount: MAX_WA_RETRY,
  })
  assert.equal(d.action, 'FAIL_FINAL')
  const reason = d.action === 'FAIL_FINAL' ? d.reason : ''
  assert.equal(/dicoba lagi/.test(reason), false)
  assert.match(reason, /hulao_order_masuk_cod/)
  assert.match(reason, /batas 12x percobaan habis/)
  assert.equal(d.action === 'FAIL_FINAL' && d.scope, 'TEMPLATE')
})

check('NO_TEMPLATE tanpa detail & retry habis → alasan default + penanda batas habis', () => {
  const d = decideFollowUpFailure({ code: 'NO_TEMPLATE', retryCount: MAX_WA_RETRY })
  assert.match(d.action === 'FAIL_FINAL' ? d.reason : '', /belum disetujui.*batas 12x percobaan habis/)
})

check('NO_TEMPLATE karena data pesanan kosong → FAIL_FINAL scope CUSTOMER (bukan template rusak)', () => {
  const d = decideFollowUpFailure({
    code: 'NO_TEMPLATE',
    permanent: true,
    detail: 'Template "x" butuh 3 parameter body, diberikan 2',
    missingData: ['{resi}'],
    retryCount: 0,
  })
  assert.equal(d.action, 'FAIL_FINAL')
  assert.equal(d.action === 'FAIL_FINAL' && d.scope, 'CUSTOMER')
  assert.match(d.action === 'FAIL_FINAL' ? d.reason : '', /\{resi\}/)
})

check('NO_TEMPLATE tanpa detail → pakai error gabungan', () => {
  const d = decideFollowUpFailure({ code: 'NO_TEMPLATE', permanent: true, error: COMBINED, retryCount: 0 })
  assert.equal(d.action === 'FAIL_FINAL' && d.reason, COMBINED)
})

check('INSUFFICIENT_CREDIT → RETRY, lalu FAIL_FINAL scope CREDIT saat habis', () => {
  assert.equal(decideFollowUpFailure({ code: 'INSUFFICIENT_CREDIT', error: 'e', retryCount: 0 }).action, 'RETRY')
  const f = decideFollowUpFailure({ code: 'INSUFFICIENT_CREDIT', error: 'e', retryCount: MAX_WA_RETRY })
  assert.equal(f.action, 'FAIL_FINAL')
  assert.equal(f.action === 'FAIL_FINAL' && f.scope, 'CREDIT')
})

check('NO_SESSION → RETRY 30 mnt sampai 12x, lalu FAIL_FINAL', () => {
  const r = decideFollowUpFailure({ code: 'NO_SESSION', retryCount: MAX_WA_RETRY - 1 })
  assert.equal(r.action, 'RETRY')
  assert.equal(r.action === 'RETRY' && r.backoffMs, WA_RECONNECT_BACKOFF_MS)
  const f = decideFollowUpFailure({ code: 'NO_SESSION', retryCount: MAX_WA_RETRY })
  assert.equal(f.action, 'FAIL_FINAL')
  assert.match(f.action === 'FAIL_FINAL' ? f.reason : '', /12/)
  assert.equal(f.action === 'FAIL_FINAL' && f.scope, 'SENDER')
})

check('MARKETING_OPT_OUT → SKIP', () => {
  assert.equal(decideFollowUpFailure({ code: 'MARKETING_OPT_OUT', retryCount: 0 }).action, 'SKIP')
})

check('generik → RETRY 15 mnt sampai 3x, lalu FAIL_FINAL scope OTHER', () => {
  const r = decideFollowUpFailure({ code: 'META_ERROR', error: 'rate', retryCount: 0 })
  assert.deepEqual(r, { action: 'RETRY', reason: 'rate', backoffMs: RETRY_BACKOFF_MS })
  const f = decideFollowUpFailure({ code: 'META_ERROR', error: 'x', retryCount: MAX_SEND_RETRY })
  assert.equal(f.action, 'FAIL_FINAL')
  assert.equal(f.action === 'FAIL_FINAL' && f.scope, 'OTHER')
  assert.match(f.action === 'FAIL_FINAL' ? f.reason : '', /batas 3x percobaan habis/)
})

check('BLACKLISTED (blacklist kontak inbox) → SKIP, bukan gagal template', () => {
  const d = decideFollowUpFailure({ code: 'BLACKLISTED', permanent: true, error: 'x', retryCount: 0 })
  assert.equal(d.action, 'SKIP')
  assert.match(d.reason, /blacklist/i)
})

check('WINDOW_CLOSED (follow-up belum ditautkan) habis retry → FAIL_FINAL scope TEMPLATE', () => {
  const f = decideFollowUpFailure({ code: 'WINDOW_CLOSED', detail: 'pilih Template Meta', retryCount: MAX_SEND_RETRY })
  assert.equal(f.action === 'FAIL_FINAL' && f.scope, 'TEMPLATE')
})

check('generik permanen (bukan blacklist/opt-out) → FAIL_FINAL langsung tanpa penanda batas', () => {
  const d = decideFollowUpFailure({ code: 'META_ERROR', permanent: true, error: 'x', retryCount: 0 })
  assert.deepEqual(d, { action: 'FAIL_FINAL', reason: 'x', scope: 'OTHER' })
})

check('tanpa error sama sekali → alasan default tidak kosong', () => {
  const d = decideFollowUpFailure({ code: 'META_ERROR', retryCount: MAX_SEND_RETRY })
  assert.equal(d.action === 'FAIL_FINAL' && d.reason.length > 0, true)
})

console.log('followup-failure-policy: emptyParamPlaceholders')

check('placeholder yang nilainya kosong/spasi saja dikembalikan unik', () => {
  assert.deepEqual(
    emptyParamPlaceholders(['{nama}', '{resi}', '{alamat}', '{resi}'], ['Budi', '', '  ', '']),
    ['{resi}', '{alamat}'],
  )
})

check('param lebih pendek dari peta → sisa peta dianggap kosong', () => {
  assert.deepEqual(emptyParamPlaceholders(['{nama}', '{total}'], ['Budi']), ['{total}'])
})

check('tanpa peta / semua terisi → []', () => {
  assert.deepEqual(emptyParamPlaceholders(null, ['a']), [])
  assert.deepEqual(emptyParamPlaceholders(['{nama}'], ['Budi']), [])
})

console.log('followup-failure-policy: notifikasi')

check('link ke halaman template follow-up dengan highlight', () => {
  assert.equal(followUpTemplateLink('tpl_1'), '/pesanan/templates?highlight=tpl_1')
})

function notif(scope: FollowUpFailureScope, reason = 'alasan') {
  return buildFollowUpFailureNotification({
    followUpTemplateId: 'tpl_1',
    templateName: 'Konfirmasi COD',
    reason,
    scope,
  })
}

check('TEMPLATE: tanpa emoji, sebut nama & alasan, dipotong, link template, sebut gagal berikutnya', () => {
  const n = notif('TEMPLATE', 'x'.repeat(1000))
  assert.ok(n)
  assert.equal(n.type, FOLLOWUP_FAILURE_NOTIF_TYPE)
  assert.equal(n.link, '/pesanan/templates?highlight=tpl_1')
  assert.match(n.message, /Konfirmasi COD/)
  assert.match(n.message, /berikutnya dengan template ini/)
  assert.ok(n.message.length < 700)
  assert.equal(/\p{Extended_Pictographic}/u.test(n.title + n.message), false)
})

check('SENDER: link /whatsapp (dedupe per user), tidak menyalahkan template', () => {
  const n = notif('SENDER')
  assert.ok(n)
  assert.equal(n.link, '/whatsapp')
  assert.equal(/template ini/.test(n.message), false)
})

check('CREDIT: link /billing', () => {
  assert.equal(notif('CREDIT')?.link, '/billing')
})

check('OTHER: link template tapi tanpa klaim "berikutnya juga akan gagal"', () => {
  const n = notif('OTHER')
  assert.ok(n)
  assert.equal(n.link, '/pesanan/templates?highlight=tpl_1')
  assert.equal(/berikutnya/.test(n.message), false)
})

check('CUSTOMER: tidak ada notifikasi (masalah satu pelanggan/pesanan)', () => {
  assert.equal(notif('CUSTOMER'), null)
})

check('judul tiap scope berbeda (kunci dedupe per kelas penyebab), tanpa emoji', () => {
  const titles = (['TEMPLATE', 'SENDER', 'CREDIT', 'OTHER'] as const).map((s) => notif(s)?.title ?? '')
  assert.equal(new Set(titles).size, titles.length)
  assert.equal(titles.some((t) => /\p{Extended_Pictographic}/u.test(t)), false)
})

console.log('followup-failure-policy: manualSendFailureStatus')

check('kirim manual gagal tidak pernah 5xx (body diganti HTML oleh Cloudflare)', () => {
  const codes = [
    'NO_SESSION', 'NO_TEMPLATE', 'INSUFFICIENT_CREDIT', 'MARKETING_OPT_OUT',
    'BLACKLISTED', 'WINDOW_CLOSED', 'META_ERROR', 'BAILEYS_ERROR', undefined,
  ] as const
  for (const code of codes) {
    for (const permanent of [true, false, undefined]) {
      const st = manualSendFailureStatus({ code, permanent })
      assert.ok(st >= 400 && st < 500, `${code}/${permanent} → ${st}`)
    }
  }
})

check('konfigurasi/kontak (template, window, blacklist, permanen) → 422; transmisi → 400', () => {
  assert.equal(manualSendFailureStatus({ code: 'NO_TEMPLATE' }), 422)
  assert.equal(manualSendFailureStatus({ code: 'WINDOW_CLOSED' }), 422)
  assert.equal(manualSendFailureStatus({ code: 'BLACKLISTED' }), 422)
  assert.equal(manualSendFailureStatus({ code: 'META_ERROR', permanent: true }), 422)
  assert.equal(manualSendFailureStatus({ code: 'META_ERROR' }), 400)
  assert.equal(manualSendFailureStatus({ code: 'NO_SESSION' }), 400)
})

console.log(`followup-failure-policy: ${passed} ok`)
