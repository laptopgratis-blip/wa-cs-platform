import assert from 'node:assert'

import { TIER_ENTITLEMENTS } from '../lp-quota'
import { ORDER_FORM_LIMIT_PER_USER } from '../validations/order-form'
import {
  freePlanEntitlement,
  lpLabTierAllowed,
  planEntitlementForPackage,
} from './plan-entitlements'

// Helper paket ringkas — default angka = konstanta tier, flag order off.
function pkg(
  tier: 'STARTER' | 'POPULAR' | 'POWER',
  over: Partial<{
    maxLp: number
    maxStorageMB: number
    canUseOrderSystem: boolean
  }> = {},
) {
  return {
    tier,
    maxLp: TIER_ENTITLEMENTS[tier].maxLp,
    maxStorageMB: TIER_ENTITLEMENTS[tier].maxStorageMB,
    canUseOrderSystem: false,
    ...over,
  }
}

// ── LP Lab: hanya POWER (mirror cek literal di app/api/lp/[lpId]/*) ──
assert.equal(lpLabTierAllowed('POWER'), true)
assert.equal(lpLabTierAllowed('POPULAR'), false)
assert.equal(lpLabTierAllowed('STARTER'), false)
assert.equal(lpLabTierAllowed('FREE'), false)
assert.equal(lpLabTierAllowed('UNKNOWN'), false)

// ── FREE: kuota konstanta, semua fitur berbayar mati ──
const free = freePlanEntitlement()
assert.equal(free.maxLp, TIER_ENTITLEMENTS.FREE.maxLp)
assert.equal(free.maxStorageMB, TIER_ENTITLEMENTS.FREE.maxStorageMB)
assert.equal(free.maxImageSizeMB, TIER_ENTITLEMENTS.FREE.maxImageSizeMB)
assert.equal(free.maxVisitorMonth, TIER_ENTITLEMENTS.FREE.maxVisitorMonth)
assert.equal(free.orderSystem, false)
assert.equal(free.hostAi, false)
assert.equal(free.lpLab, false)

// ── STARTER: cuma kuota naik ──
const starter = planEntitlementForPackage(pkg('STARTER'))
assert.equal(starter.maxLp, TIER_ENTITLEMENTS.STARTER.maxLp)
assert.equal(starter.maxVisitorMonth, TIER_ENTITLEMENTS.STARTER.maxVisitorMonth)
assert.equal(starter.hostAi, false)
assert.equal(starter.lpLab, false)
assert.equal(starter.orderSystem, false)

// ── POPULAR: Sistem Order ikut flag DB, limit form 20, Host AI on ──
const popular = planEntitlementForPackage(
  pkg('POPULAR', { canUseOrderSystem: true }),
)
assert.equal(popular.orderSystem, true)
assert.equal(popular.orderFormLimit, ORDER_FORM_LIMIT_PER_USER)
assert.equal(popular.hostAi, true)
assert.equal(popular.lpLab, false)

// Flag DB dimatikan admin → kartu tidak boleh menjanjikan Sistem Order.
const popularNoOrder = planEntitlementForPackage(pkg('POPULAR'))
assert.equal(popularNoOrder.orderSystem, false)

// ── POWER: form order tanpa batas + LP Lab ──
const power = planEntitlementForPackage(
  pkg('POWER', { canUseOrderSystem: true }),
)
assert.equal(power.orderFormLimit, null)
assert.equal(power.lpLab, true)
assert.equal(power.hostAi, true)

// ── maxLp/maxStorage = MAX(konstanta tier, paket) — sama dgn enforcement ──
const popularSmall = planEntitlementForPackage(
  pkg('POPULAR', { maxLp: 2, maxStorageMB: 10 }),
)
assert.equal(popularSmall.maxLp, TIER_ENTITLEMENTS.POPULAR.maxLp)
assert.equal(popularSmall.maxStorageMB, TIER_ENTITLEMENTS.POPULAR.maxStorageMB)

const popularBig = planEntitlementForPackage(
  pkg('POPULAR', { maxLp: 25, maxStorageMB: 250 }),
)
assert.equal(popularBig.maxLp, 25)
assert.equal(popularBig.maxStorageMB, 250)

console.log('plan-entitlements ok')
