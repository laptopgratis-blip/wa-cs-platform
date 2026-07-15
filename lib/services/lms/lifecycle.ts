// LMS Subscription Lifecycle — mirror pola LP (lib/services/subscription.ts):
// kuota LMS adalah TURUNAN state LmsSubscription hidup.
//
// "Sub hidup" = status ACTIVE atau CANCELLED (kalau nanti cancel LMS
// dibangun, janjinya sama: akses jalan sampai endDate) yang endDate-nya
// masih di depan. LmsSubscription tidak punya isLifetime.
//
// expireLmsSubscription dipanggil dari cron /api/cron/subscription-expire
// (endpoint yang sama dengan LP — sudah terjadwal harian, tanpa setup baru).
import type { LmsTier, Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import {
  createNotification,
  sendWaNotificationToUser,
} from '@/lib/services/subscription'

type Db = Prisma.TransactionClient | typeof prisma

export const LMS_TIER_RANK: Record<string, number> = {
  FREE: 0,
  BASIC: 1,
  PRO: 2,
  UNLIMITED: 3,
}

// Default FREE — mirror FREE_DEFAULT di ./quota.ts (sumber seed row FREE).
const LMS_FREE_ENTITLEMENT = {
  tier: 'FREE' as LmsTier,
  maxCourses: 1,
  maxLessonsPerCourse: 5,
  maxStudentsPerCourse: 50,
  maxFileStorageMB: 0,
  canUseDripSchedule: false,
  canIssueCertificate: false,
}

export interface LiveLmsSubInput {
  status: string
  endDate: Date
  tier: string
  maxCourses: number
  maxLessonsPerCourse: number
  maxStudentsPerCourse: number
  maxFileStorageMB: number
  canUseDripSchedule: boolean
  canIssueCertificate: boolean
}

export function isLmsSubscriptionLive(
  sub: { status: string; endDate: Date },
  now: Date,
): boolean {
  if (sub.status !== 'ACTIVE' && sub.status !== 'CANCELLED') return false
  return sub.endDate.getTime() > now.getTime()
}

export interface LmsEntitlement {
  tier: LmsTier
  maxCourses: number
  maxLessonsPerCourse: number
  maxStudentsPerCourse: number
  maxFileStorageMB: number
  canUseDripSchedule: boolean
  canIssueCertificate: boolean
}

// -1 = unlimited di limit LMS — MAX naif akan "mengalahkan" unlimited,
// jadi pakai helper: salah satu unlimited → unlimited.
function pickLimit(a: number, b: number): number {
  if (a < 0 || b < 0) return -1
  return Math.max(a, b)
}

export function resolveLmsEntitlement(
  subs: LiveLmsSubInput[],
  now: Date,
): LmsEntitlement {
  const live = subs.filter((s) => isLmsSubscriptionLive(s, now))
  if (live.length === 0) return { ...LMS_FREE_ENTITLEMENT }

  // Tier pemenang = rank tertinggi. LmsUpgradePackage.tier @unique → limit
  // per tier seragam, tapi tetap gabung defensif (pickLimit + OR boolean).
  let tier: LmsTier = 'FREE'
  for (const s of live) {
    if ((LMS_TIER_RANK[s.tier] ?? 0) > (LMS_TIER_RANK[tier] ?? 0)) {
      tier = s.tier as LmsTier
    }
  }

  const winners = live.filter(
    (s) => (LMS_TIER_RANK[s.tier] ?? 0) === (LMS_TIER_RANK[tier] ?? 0),
  )
  const ent = winners.reduce<LmsEntitlement>(
    (acc, s) => ({
      tier,
      maxCourses: pickLimit(acc.maxCourses, s.maxCourses),
      maxLessonsPerCourse: pickLimit(
        acc.maxLessonsPerCourse,
        s.maxLessonsPerCourse,
      ),
      maxStudentsPerCourse: pickLimit(
        acc.maxStudentsPerCourse,
        s.maxStudentsPerCourse,
      ),
      maxFileStorageMB: pickLimit(acc.maxFileStorageMB, s.maxFileStorageMB),
      canUseDripSchedule: acc.canUseDripSchedule || s.canUseDripSchedule,
      canIssueCertificate: acc.canIssueCertificate || s.canIssueCertificate,
    }),
    {
      tier,
      maxCourses: 0,
      maxLessonsPerCourse: 0,
      maxStudentsPerCourse: 0,
      maxFileStorageMB: 0,
      canUseDripSchedule: false,
      canIssueCertificate: false,
    },
  )
  return ent
}

export interface LmsDowngradeCheck {
  blocked: boolean
  blockingPackageName?: string
  blockingEndDate?: Date
}

// Blok beli tier LMS lebih rendah dari sub hidup tertinggi — mirror LP.
export function isLmsDowngradePurchase(
  targetTier: string,
  liveSubs: Array<{ tier: string; packageName: string; endDate: Date }>,
): LmsDowngradeCheck {
  let top: (typeof liveSubs)[number] | null = null
  for (const s of liveSubs) {
    if (!top || (LMS_TIER_RANK[s.tier] ?? 0) > (LMS_TIER_RANK[top.tier] ?? 0)) {
      top = s
    }
  }
  if (!top) return { blocked: false }
  if ((LMS_TIER_RANK[targetTier] ?? 0) >= (LMS_TIER_RANK[top.tier] ?? 0)) {
    return { blocked: false }
  }
  return {
    blocked: true,
    blockingPackageName: top.packageName,
    blockingEndDate: top.endDate,
  }
}

// Tulis ulang LmsQuota dari state LmsSubscription saat ini — idempotent &
// konvergen. Satu-satunya penulis kuota LMS (checkout + expire lewat sini).
export async function syncLmsQuotaFromSubscriptions(
  userId: string,
  db: Db = prisma,
) {
  const now = new Date()
  const subs = await db.lmsSubscription.findMany({
    where: {
      userId,
      status: { in: ['ACTIVE', 'CANCELLED'] },
      endDate: { gt: now },
    },
    select: {
      status: true,
      endDate: true,
      lmsPackage: {
        select: {
          tier: true,
          maxCourses: true,
          maxLessonsPerCourse: true,
          maxStudentsPerCourse: true,
          maxFileStorageMB: true,
          canUseDripSchedule: true,
          canIssueCertificate: true,
        },
      },
    },
  })

  const ent = resolveLmsEntitlement(
    subs.map((s) => ({
      status: s.status,
      endDate: s.endDate,
      tier: s.lmsPackage.tier,
      maxCourses: s.lmsPackage.maxCourses,
      maxLessonsPerCourse: s.lmsPackage.maxLessonsPerCourse,
      maxStudentsPerCourse: s.lmsPackage.maxStudentsPerCourse,
      maxFileStorageMB: s.lmsPackage.maxFileStorageMB,
      canUseDripSchedule: s.lmsPackage.canUseDripSchedule,
      canIssueCertificate: s.lmsPackage.canIssueCertificate,
    })),
    now,
  )

  return db.lmsQuota.upsert({
    where: { userId },
    create: { userId, ...ent },
    update: ent,
  })
}

// endDate lewat → EXPIRED + sync kuota + notif. Idempotent: status flip di
// dalam tx; pemanggilan ulang untuk sub yang sama jadi no-op.
export async function expireLmsSubscription(
  subscriptionId: string,
): Promise<void> {
  const sub = await prisma.lmsSubscription.findUnique({
    where: { id: subscriptionId },
    include: { lmsPackage: { select: { name: true } } },
  })
  if (!sub) return
  if (sub.status !== 'ACTIVE' && sub.status !== 'CANCELLED') return

  const quotaAfter = await prisma.$transaction(async (tx) => {
    await tx.lmsSubscription.update({
      where: { id: subscriptionId },
      data: { status: 'EXPIRED' },
    })
    return syncLmsQuotaFromSubscriptions(sub.userId, tx)
  })

  if (quotaAfter.tier === 'FREE') {
    await createNotification({
      userId: sub.userId,
      subscriptionId,
      type: 'LMS_EXPIRED',
      channel: 'IN_APP',
      title: '⏰ Plan LMS Berakhir',
      message: `Plan LMS ${sub.lmsPackage.name} kamu sudah berakhir. Akun LMS otomatis turun ke FREE. Kursus & data tidak hilang, tapi kuota mengikuti FREE. Perpanjang di /pricing-lms.`,
      link: '/pricing-lms',
    })
    void sendWaNotificationToUser(sub.userId, {
      title: 'Plan LMS Berakhir',
      message: `Plan LMS ${sub.lmsPackage.name} sudah berakhir, kuota LMS turun ke FREE. Perpanjang di hulao.id/pricing-lms.`,
      subscriptionId,
    })
  } else {
    await createNotification({
      userId: sub.userId,
      subscriptionId,
      type: 'LMS_EXPIRED',
      channel: 'IN_APP',
      title: '⏰ Satu Plan LMS Berakhir',
      message: `Plan LMS ${sub.lmsPackage.name} kamu sudah berakhir. Akun LMS sekarang mengikuti plan ${quotaAfter.tier} yang masih aktif.`,
      link: '/pricing-lms',
    })
  }
}
