import assert from 'node:assert'

import {
  isDowngradePurchase,
  isSubscriptionLive,
  resolveLpEntitlement,
} from './subscription'

const NOW = new Date('2026-07-14T12:00:00Z')
const BESOK = new Date('2026-07-15T12:00:00Z')
const KEMARIN = new Date('2026-07-13T12:00:00Z')

// Helper bikin sub hidup ringkas.
function sub(
  tier: string,
  over: Partial<{
    status: string
    isLifetime: boolean
    endDate: Date
    maxLp: number
    maxStorageMB: number
  }> = {},
) {
  return {
    status: over.status ?? 'ACTIVE',
    isLifetime: over.isLifetime ?? false,
    endDate: over.endDate ?? BESOK,
    tier,
    maxLp: over.maxLp ?? 0,
    maxStorageMB: over.maxStorageMB ?? 0,
  }
}

// ── isSubscriptionLive ──
assert.equal(isSubscriptionLive(sub('POPULAR'), NOW), true)
assert.equal(isSubscriptionLive(sub('POPULAR', { status: 'CANCELLED' }), NOW), true) // cancel: akses s.d. endDate
assert.equal(isSubscriptionLive(sub('POPULAR', { endDate: KEMARIN }), NOW), false)
assert.equal(
  isSubscriptionLive(sub('POPULAR', { status: 'CANCELLED', endDate: KEMARIN }), NOW),
  false,
)
assert.equal(
  isSubscriptionLive(sub('POWER', { isLifetime: true, endDate: KEMARIN }), NOW),
  true, // lifetime: endDate diabaikan
)
assert.equal(isSubscriptionLive(sub('POPULAR', { status: 'EXPIRED' }), NOW), false)
assert.equal(isSubscriptionLive(sub('POPULAR', { status: 'REPLACED' }), NOW), false)
assert.equal(isSubscriptionLive(sub('POPULAR', { status: 'PENDING' }), NOW), false)

// ── resolveLpEntitlement ──
// Tanpa sub → FREE default.
{
  const e = resolveLpEntitlement([], NOW)
  assert.equal(e.tier, 'FREE')
  assert.equal(e.maxLp, 1)
  assert.equal(e.maxVisitorMonth, 1000)
  assert.equal(e.maxImageSizeMB, 1)
}
// ACTIVE tunggal → entitlement tier + MAX dengan paket.
{
  const e = resolveLpEntitlement([sub('POPULAR', { maxLp: 10, maxStorageMB: 100 })], NOW)
  assert.equal(e.tier, 'POPULAR')
  assert.equal(e.maxLp, 10)
  assert.equal(e.maxStorageMB, 100)
  assert.equal(e.maxVisitorMonth, 100_000)
  assert.equal(e.maxImageSizeMB, 5)
}
// Paket admin lebih besar dari default → MAX menang.
{
  const e = resolveLpEntitlement([sub('STARTER', { maxLp: 7, maxStorageMB: 50 })], NOW)
  assert.equal(e.maxLp, 7)
  assert.equal(e.maxStorageMB, 50)
  assert.equal(e.maxImageSizeMB, 3)
}
// CANCELLED belum lewat endDate → tetap dihitung.
{
  const e = resolveLpEntitlement([sub('POWER', { status: 'CANCELLED' })], NOW)
  assert.equal(e.tier, 'POWER')
  assert.equal(e.maxImageSizeMB, 10)
}
// CANCELLED sudah lewat endDate → turun FREE.
{
  const e = resolveLpEntitlement(
    [sub('POWER', { status: 'CANCELLED', endDate: KEMARIN })],
    NOW,
  )
  assert.equal(e.tier, 'FREE')
}
// Dobel sub beda tier (kasus prod didinmisbachudin14) → rank tertinggi menang.
{
  const e = resolveLpEntitlement(
    [sub('STARTER', { maxLp: 3 }), sub('POWER', { maxLp: 999, maxStorageMB: 500 })],
    NOW,
  )
  assert.equal(e.tier, 'POWER')
  assert.equal(e.maxLp, 999)
  assert.equal(e.maxVisitorMonth, 5_000_000)
}
// Dobel sub tier tinggi EXPIRED-di-masa-depan… tier tinggi lewat endDate →
// yang tersisa menentukan (bug guard lama: kuota nyangkut di tier tinggi).
{
  const e = resolveLpEntitlement(
    [sub('POWER', { endDate: KEMARIN }), sub('STARTER', { maxLp: 3 })],
    NOW,
  )
  assert.equal(e.tier, 'STARTER')
  assert.equal(e.maxVisitorMonth, 20_000)
}
// Same-tier dua paket → MAX maxLp/maxStorage.
{
  const e = resolveLpEntitlement(
    [sub('POPULAR', { maxLp: 10 }), sub('POPULAR', { maxLp: 15, maxStorageMB: 200 })],
    NOW,
  )
  assert.equal(e.maxLp, 15)
  assert.equal(e.maxStorageMB, 200)
}
// legacyTier floor menang atas sub lebih rendah (grandfather top-up).
{
  const e = resolveLpEntitlement([sub('POPULAR', { maxLp: 10 })], NOW, 'POWER')
  assert.equal(e.tier, 'POWER')
  assert.equal(e.maxLp, 999) // default TIERS POWER — tidak ada paket POWER hidup
  assert.equal(e.maxImageSizeMB, 10)
}
// legacyTier kalah dari sub lebih tinggi → sub menang.
{
  const e = resolveLpEntitlement([sub('POWER', { maxLp: 999 })], NOW, 'STARTER')
  assert.equal(e.tier, 'POWER')
}
// legacyTier sendirian tanpa sub → tetap dihormati.
{
  const e = resolveLpEntitlement([], NOW, 'POPULAR')
  assert.equal(e.tier, 'POPULAR')
  assert.equal(e.maxLp, 10)
}
// Tier tak dikenal di sub → dianggap rank 0, jatuh ke FREE.
{
  const e = resolveLpEntitlement([sub('ENTERPRISE')], NOW)
  assert.equal(e.tier, 'FREE')
}

// ── isDowngradePurchase ──
const livePopular = [
  { tier: 'POPULAR', packageName: 'Popular', endDate: BESOK },
]
// Beli lebih rendah dari sub hidup → blocked.
{
  const c = isDowngradePurchase('STARTER', livePopular)
  assert.equal(c.blocked, true)
  assert.equal(c.blockingPackageName, 'Popular')
  assert.equal(c.blockingEndDate, BESOK)
}
// Same-tier (extend) & upgrade → lolos.
assert.equal(isDowngradePurchase('POPULAR', livePopular).blocked, false)
assert.equal(isDowngradePurchase('POWER', livePopular).blocked, false)
// Tanpa sub hidup → bebas beli apa pun.
assert.equal(isDowngradePurchase('STARTER', []).blocked, false)
// Dobel sub → pembanding adalah rank TERTINGGI.
{
  const c = isDowngradePurchase('POPULAR', [
    { tier: 'STARTER', packageName: 'Starter', endDate: BESOK },
    { tier: 'POWER', packageName: 'Power', endDate: BESOK },
  ])
  assert.equal(c.blocked, true)
  assert.equal(c.blockingPackageName, 'Power')
}

console.log('subscription-entitlement ok')
