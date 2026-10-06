// Uji daftar placeholder follow-up (sumber tunggal UI + validasi). `npm test`.
import assert from 'node:assert/strict'

import {
  ALL_FOLLOWUP_PLACEHOLDERS,
  FOLLOWUP_DUMMY_PREVIEW,
  LEAD_PLACEHOLDERS,
  ORDER_PLACEHOLDERS,
  allowedPlaceholdersForTrigger,
  previewFollowUpText,
} from './followup-placeholders'
import {
  DUMMY_RESOLVE_CONTEXT,
  resolveLeadTemplateVariables,
  resolveTemplateVariables,
} from './followup-variables'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

console.log('followup-placeholders')

check('trigger lead → placeholder lead; trigger order → placeholder order', () => {
  assert.deepEqual(allowedPlaceholdersForTrigger('DAYS_AFTER_LIVE_LEAD'), LEAD_PLACEHOLDERS)
  assert.deepEqual(allowedPlaceholdersForTrigger('ORDER_CREATED'), ORDER_PLACEHOLDERS)
  assert.deepEqual(allowedPlaceholdersForTrigger('DAYS_AFTER_PAID'), ORDER_PLACEHOLDERS)
})

check('setiap placeholder order di-resolve resolveTemplateVariables', () => {
  for (const ph of ORDER_PLACEHOLDERS) {
    const out = resolveTemplateVariables(ph, DUMMY_RESOLVE_CONTEXT)
    assert.notEqual(out, ph, `${ph} tidak di-resolve`)
  }
})

check('setiap placeholder lead di-resolve resolveLeadTemplateVariables', () => {
  const ctx = { customerName: 'A', productInterest: 'B', storeName: 'C', orderLink: 'https://x' }
  for (const ph of LEAD_PLACEHOLDERS) {
    assert.notEqual(resolveLeadTemplateVariables(ph, ctx), ph, `${ph} tidak di-resolve`)
  }
})

check('lead tidak memuat placeholder order', () => {
  assert.equal(LEAD_PLACEHOLDERS.includes('{invoice}'), false)
  assert.equal(LEAD_PLACEHOLDERS.includes('{total}'), false)
})

check('daftar gabungan unik & semua punya nilai preview', () => {
  assert.equal(new Set(ALL_FOLLOWUP_PLACEHOLDERS).size, ALL_FOLLOWUP_PLACEHOLDERS.length)
  for (const ph of [...ORDER_PLACEHOLDERS, ...LEAD_PLACEHOLDERS]) {
    assert.ok(ALL_FOLLOWUP_PLACEHOLDERS.includes(ph), ph)
    assert.ok(FOLLOWUP_DUMMY_PREVIEW[ph], `preview ${ph}`)
  }
})

check('previewFollowUpText mengganti semua placeholder', () => {
  assert.equal(previewFollowUpText('Halo {nama}, {invoice}'), 'Halo Andi Pratama (TEST), INV-TEST-001')
})

console.log(`followup-placeholders: ${passed} ok`)
