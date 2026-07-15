import assert from 'node:assert'

import {
  isLmsDowngradePurchase,
  isLmsSubscriptionLive,
  resolveLmsEntitlement,
} from './lifecycle'

const NOW = new Date('2026-07-14T12:00:00Z')
const BESOK = new Date('2026-07-15T12:00:00Z')
const KEMARIN = new Date('2026-07-13T12:00:00Z')

function sub(
  tier: string,
  over: Partial<{
    status: string
    endDate: Date
    maxCourses: number
    maxLessonsPerCourse: number
    maxStudentsPerCourse: number
    maxFileStorageMB: number
    canUseDripSchedule: boolean
    canIssueCertificate: boolean
  }> = {},
) {
  return {
    status: over.status ?? 'ACTIVE',
    endDate: over.endDate ?? BESOK,
    tier,
    maxCourses: over.maxCourses ?? 3,
    maxLessonsPerCourse: over.maxLessonsPerCourse ?? 20,
    maxStudentsPerCourse: over.maxStudentsPerCourse ?? 200,
    maxFileStorageMB: over.maxFileStorageMB ?? 100,
    canUseDripSchedule: over.canUseDripSchedule ?? false,
    canIssueCertificate: over.canIssueCertificate ?? false,
  }
}

// ── isLmsSubscriptionLive ──
assert.equal(isLmsSubscriptionLive(sub('PRO'), NOW), true)
assert.equal(isLmsSubscriptionLive(sub('PRO', { status: 'CANCELLED' }), NOW), true)
assert.equal(isLmsSubscriptionLive(sub('PRO', { endDate: KEMARIN }), NOW), false)
assert.equal(isLmsSubscriptionLive(sub('PRO', { status: 'EXPIRED' }), NOW), false)

// ── resolveLmsEntitlement ──
// Tanpa sub → FREE default (mirror FREE_DEFAULT quota.ts).
{
  const e = resolveLmsEntitlement([], NOW)
  assert.equal(e.tier, 'FREE')
  assert.equal(e.maxCourses, 1)
  assert.equal(e.maxLessonsPerCourse, 5)
  assert.equal(e.canUseDripSchedule, false)
}
// ACTIVE tunggal → limit paket.
{
  const e = resolveLmsEntitlement(
    [sub('PRO', { maxCourses: 10, canUseDripSchedule: true })],
    NOW,
  )
  assert.equal(e.tier, 'PRO')
  assert.equal(e.maxCourses, 10)
  assert.equal(e.canUseDripSchedule, true)
}
// Lewat endDate → FREE.
{
  const e = resolveLmsEntitlement([sub('PRO', { endDate: KEMARIN })], NOW)
  assert.equal(e.tier, 'FREE')
}
// Dobel tier → rank tertinggi menang.
{
  const e = resolveLmsEntitlement(
    [sub('BASIC', { maxCourses: 3 }), sub('UNLIMITED', { maxCourses: -1 })],
    NOW,
  )
  assert.equal(e.tier, 'UNLIMITED')
  assert.equal(e.maxCourses, -1)
}
// -1 (unlimited) tidak boleh kalah oleh MAX naif saat same-tier dobel.
{
  const e = resolveLmsEntitlement(
    [sub('PRO', { maxCourses: -1 }), sub('PRO', { maxCourses: 10 })],
    NOW,
  )
  assert.equal(e.maxCourses, -1)
}

// ── isLmsDowngradePurchase ──
const livePro = [{ tier: 'PRO', packageName: 'Pro', endDate: BESOK }]
assert.equal(isLmsDowngradePurchase('BASIC', livePro).blocked, true)
assert.equal(isLmsDowngradePurchase('PRO', livePro).blocked, false)
assert.equal(isLmsDowngradePurchase('UNLIMITED', livePro).blocked, false)
assert.equal(isLmsDowngradePurchase('BASIC', []).blocked, false)

console.log('lms-entitlement ok')
