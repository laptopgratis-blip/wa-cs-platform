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
  followUpTemplateLink,
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
  assert.deepEqual(d, { action: 'FAIL_FINAL', reason: 'Template Meta "x" masih DRAFT' })
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

check('NO_TEMPLATE transient tapi retry habis → FAIL_FINAL', () => {
  const d = decideFollowUpFailure({ code: 'NO_TEMPLATE', detail: 'r', retryCount: MAX_WA_RETRY })
  assert.equal(d.action, 'FAIL_FINAL')
})

check('NO_TEMPLATE tanpa detail → pakai error gabungan', () => {
  const d = decideFollowUpFailure({ code: 'NO_TEMPLATE', permanent: true, error: COMBINED, retryCount: 0 })
  assert.equal(d.action === 'FAIL_FINAL' && d.reason, COMBINED)
})

check('INSUFFICIENT_CREDIT → RETRY, lalu FAIL_FINAL saat habis', () => {
  assert.equal(decideFollowUpFailure({ code: 'INSUFFICIENT_CREDIT', error: 'e', retryCount: 0 }).action, 'RETRY')
  assert.equal(
    decideFollowUpFailure({ code: 'INSUFFICIENT_CREDIT', error: 'e', retryCount: MAX_WA_RETRY }).action,
    'FAIL_FINAL',
  )
})

check('NO_SESSION → RETRY 30 mnt sampai 12x, lalu FAIL_FINAL', () => {
  const r = decideFollowUpFailure({ code: 'NO_SESSION', retryCount: MAX_WA_RETRY - 1 })
  assert.equal(r.action, 'RETRY')
  assert.equal(r.action === 'RETRY' && r.backoffMs, WA_RECONNECT_BACKOFF_MS)
  const f = decideFollowUpFailure({ code: 'NO_SESSION', retryCount: MAX_WA_RETRY })
  assert.equal(f.action, 'FAIL_FINAL')
  assert.match(f.action === 'FAIL_FINAL' ? f.reason : '', /12/)
})

check('MARKETING_OPT_OUT → SKIP', () => {
  assert.equal(decideFollowUpFailure({ code: 'MARKETING_OPT_OUT', retryCount: 0 }).action, 'SKIP')
})

check('generik → RETRY 15 mnt sampai 3x, lalu FAIL_FINAL', () => {
  const r = decideFollowUpFailure({ code: 'META_ERROR', error: 'rate', retryCount: 0 })
  assert.deepEqual(r, { action: 'RETRY', reason: 'rate', backoffMs: RETRY_BACKOFF_MS })
  assert.equal(decideFollowUpFailure({ code: 'META_ERROR', error: 'x', retryCount: MAX_SEND_RETRY }).action, 'FAIL_FINAL')
})

check('generik permanen (mis. BLACKLISTED) → FAIL_FINAL langsung', () => {
  assert.equal(
    decideFollowUpFailure({ code: 'BLACKLISTED', permanent: true, error: 'x', retryCount: 0 }).action,
    'FAIL_FINAL',
  )
})

check('tanpa error sama sekali → alasan default tidak kosong', () => {
  const d = decideFollowUpFailure({ code: 'META_ERROR', retryCount: MAX_SEND_RETRY })
  assert.equal(d.action === 'FAIL_FINAL' && d.reason.length > 0, true)
})

console.log('followup-failure-policy: notifikasi')

check('link ke halaman template follow-up dengan highlight', () => {
  assert.equal(followUpTemplateLink('tpl_1'), '/pesanan/templates?highlight=tpl_1')
})

check('isi notifikasi: tanpa emoji, sebut nama template & alasan, dipotong', () => {
  const n = buildFollowUpFailureNotification({
    followUpTemplateId: 'tpl_1',
    templateName: 'Konfirmasi COD',
    reason: 'x'.repeat(1000),
  })
  assert.equal(n.type, FOLLOWUP_FAILURE_NOTIF_TYPE)
  assert.equal(n.link, '/pesanan/templates?highlight=tpl_1')
  assert.match(n.message, /Konfirmasi COD/)
  assert.ok(n.message.length < 700)
  assert.equal(/\p{Extended_Pictographic}/u.test(n.title + n.message), false)
})

console.log(`followup-failure-policy: ${passed} ok`)
