// Uji variabel {wa_admin} follow-up — CS WhatsApp per produk. `npm test`.
import assert from 'node:assert/strict'

import type { UserShippingProfile } from '@prisma/client'

import {
  DUMMY_RESOLVE_CONTEXT,
  type ResolveContext,
  resolveTemplateParams,
  resolveTemplateVariables,
} from './followup-variables'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const STORE_NUMBER = '628111222333'
const CS_NUMBER = '6285550001111'
const TEMPLATE = 'Hubungi admin: wa.me/{wa_admin}'

// Konteks seperti yang dirakit pemanggil LAMA — tanpa field csNumber.
const LEGACY_CTX: ResolveContext = {
  order: DUMMY_RESOLVE_CONTEXT.order,
  user: DUMMY_RESOLVE_CONTEXT.user,
  bankAccounts: DUMMY_RESOLVE_CONTEXT.bankAccounts,
  shippingProfile: { waConfirmNumber: STORE_NUMBER } as UserShippingProfile,
}

console.log('followup-variables: {wa_admin}')

check('tanpa csNumber (konteks lama) → nomor konfirmasi toko', () => {
  assert.equal(
    resolveTemplateVariables(TEMPLATE, LEGACY_CTX),
    `Hubungi admin: wa.me/${STORE_NUMBER}`,
  )
})

check('csNumber terisi → nomor CS produk menggantikan nomor toko', () => {
  assert.equal(
    resolveTemplateVariables(TEMPLATE, { ...LEGACY_CTX, csNumber: CS_NUMBER }),
    `Hubungi admin: wa.me/${CS_NUMBER}`,
  )
})

check('csNumber null / kosong → jatuh ke nomor toko', () => {
  for (const csNumber of [null, undefined, '']) {
    assert.equal(
      resolveTemplateVariables(TEMPLATE, { ...LEGACY_CTX, csNumber }),
      `Hubungi admin: wa.me/${STORE_NUMBER}`,
    )
  }
})

check('csNumber terisi walau profil toko belum ada → nomor CS', () => {
  assert.equal(
    resolveTemplateVariables(TEMPLATE, {
      ...LEGACY_CTX,
      shippingProfile: null,
      csNumber: CS_NUMBER,
    }),
    `Hubungi admin: wa.me/${CS_NUMBER}`,
  )
})

check('tanpa csNumber & tanpa nomor toko → "-"', () => {
  assert.equal(
    resolveTemplateVariables(TEMPLATE, {
      ...LEGACY_CTX,
      shippingProfile: null,
    }),
    'Hubungi admin: wa.me/-',
  )
  assert.equal(
    resolveTemplateVariables(TEMPLATE, {
      ...LEGACY_CTX,
      shippingProfile: { waConfirmNumber: null } as UserShippingProfile,
      csNumber: null,
    }),
    'Hubungi admin: wa.me/-',
  )
})

check('parameter Template Meta ikut memakai nomor CS', () => {
  assert.deepEqual(
    resolveTemplateParams(['{wa_admin}', '{nama}'], {
      ...LEGACY_CTX,
      csNumber: CS_NUMBER,
    }),
    [CS_NUMBER, 'Andi Pratama (TEST)'],
  )
  assert.deepEqual(resolveTemplateParams(['{wa_admin}'], LEGACY_CTX), [
    STORE_NUMBER,
  ])
})

check('variabel lain tidak terpengaruh csNumber', () => {
  const tpl = '{nama}|{invoice}|{total}|{nama_toko}'
  assert.equal(
    resolveTemplateVariables(tpl, { ...LEGACY_CTX, csNumber: CS_NUMBER }),
    resolveTemplateVariables(tpl, LEGACY_CTX),
  )
})

console.log(`followup-variables: ${passed} ok`)
