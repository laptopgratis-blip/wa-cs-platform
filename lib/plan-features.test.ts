import assert from 'node:assert'

import {
  type PlanColumn,
  type PlanEntitlement,
  buildFeatureSections,
  buildPlanHighlights,
} from './plan-features'
import { ORDER_FORM_LIMIT_PER_USER } from './validations/order-form'
import { PRODUCT_LIMIT_PER_USER } from './validations/product'

const BASE: PlanEntitlement = {
  maxLp: 1,
  maxStorageMB: 5,
  maxImageSizeMB: 1,
  maxVisitorMonth: 1_000,
  orderSystem: false,
  orderFormLimit: ORDER_FORM_LIMIT_PER_USER,
  hostAi: false,
  lpLab: false,
}

function plan(id: string, over: Partial<PlanEntitlement>): PlanColumn {
  return {
    id,
    name: id,
    tier: id.toUpperCase(),
    entitlement: { ...BASE, ...over },
  }
}

const free = plan('free', {})
const popular = plan('popular', {
  maxLp: 10,
  orderSystem: true,
  hostAi: true,
})
const power = plan('power', {
  maxLp: 999,
  maxVisitorMonth: 5_000_000,
  orderSystem: true,
  orderFormLimit: null,
  hostAi: true,
  lpLab: true,
})

// ── Highlight kartu ──
function item(list: ReturnType<typeof buildPlanHighlights>, key: string) {
  const found = list.find((h) => h.key === key)
  assert.ok(found, `highlight ${key} harus ada`)
  return found
}

const hlFree = buildPlanHighlights(free.entitlement)
assert.equal(item(hlFree, 'lp-count').value, '1')
assert.equal(item(hlFree, 'order-system').included, false)
assert.equal(item(hlFree, 'host-ai').included, false)
assert.equal(item(hlFree, 'lp-lab').included, false)
// AI Generate ada di semua paket, tapi wajib jujur soal token.
assert.equal(item(hlFree, 'ai-generate').included, true)
assert.match(item(hlFree, 'ai-generate').detail ?? '', /token/)

const hlPopular = buildPlanHighlights(popular.entitlement)
assert.equal(item(hlPopular, 'order-system').included, true)
assert.match(
  item(hlPopular, 'order-system').detail ?? '',
  new RegExp(`maks ${ORDER_FORM_LIMIT_PER_USER} form`),
)
assert.equal(item(hlPopular, 'host-ai').included, true)
assert.equal(item(hlPopular, 'lp-lab').included, false)

const hlPower = buildPlanHighlights(power.entitlement)
assert.match(item(hlPower, 'order-system').detail ?? '', /tanpa batas/)
assert.equal(item(hlPower, 'lp-lab').included, true)
// Angka besar diformat id-ID.
assert.equal(item(hlPower, 'visitor').value, '5.000.000/bulan')

// ── Matriks perbandingan ──
const plans = [free, popular, power]
const sections = buildFeatureSections(plans)
const keys = sections.flatMap((s) => s.rows.map((r) => r.key))
assert.equal(new Set(keys).size, keys.length, 'key baris harus unik')

function row(key: string) {
  const found = sections.flatMap((s) => s.rows).find((r) => r.key === key)
  assert.ok(found, `baris ${key} harus ada`)
  return found
}

// Nilai sejajar urutan kolom paket.
for (const s of sections) {
  for (const r of s.rows) {
    assert.equal(r.values.length, plans.length, `baris ${r.key} sejajar kolom`)
  }
}

assert.deepEqual(row('lp-count').values, ['1', '10', '999'])
assert.deepEqual(row('order-forms').values, [
  false,
  `Maks ${ORDER_FORM_LIMIT_PER_USER}`,
  'Tanpa batas',
])
assert.deepEqual(row('lab-heatmap').values, [false, false, true])
assert.match(
  row('products').hint ?? '',
  new RegExp(`${PRODUCT_LIMIT_PER_USER}`),
)

// Sistem Order mengikuti flag DB, bukan nama tier: POWER tanpa flag = mati.
const powerNoOrder = plan('power', { ...power.entitlement, orderSystem: false })
const noOrderRows = buildFeatureSections([powerNoOrder])
  .flatMap((s) => s.rows)
  .filter((r) => r.key === 'order-forms' || r.key === 'products')
for (const r of noOrderRows) assert.deepEqual(r.values, [false])

// Fitur WhatsApp sama di semua paket — tidak boleh ada nilai false.
const waSection = sections.find((s) => s.key === 'whatsapp')
assert.ok(waSection, 'section whatsapp harus ada')
for (const r of waSection.rows) {
  assert.ok(!r.values.includes(false), `${r.key} tersedia di semua paket`)
}

console.log('plan-features ok')
