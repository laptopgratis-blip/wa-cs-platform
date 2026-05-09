// LMS Quota — get/upsert quota aktif user. Pakai LmsQuota row; lazily
// created sebagai FREE kalau belum ada.
//
// Quota di-konsumsi di service course.ts saat:
//   - createCourse → cek maxCourses
//   - createLesson → cek maxLessonsPerCourse
//
// Field maxStudentsPerCourse + maxFileStorageMB di-cek di Phase 4 (file
// upload + portal student counter aktivasi).
import type { LmsQuota } from '@prisma/client'

import { prisma } from '@/lib/prisma'

export interface ActiveLmsQuota {
  tier: string
  maxCourses: number
  maxLessonsPerCourse: number
  maxStudentsPerCourse: number
  maxFileStorageMB: number
  canUseDripSchedule: boolean
  canIssueCertificate: boolean
}

const FREE_DEFAULT: Omit<ActiveLmsQuota, 'tier'> = {
  maxCourses: 1,
  maxLessonsPerCourse: 5,
  maxStudentsPerCourse: 50,
  maxFileStorageMB: 0,
  canUseDripSchedule: false,
  canIssueCertificate: false,
}

// Get current quota — lazy-create FREE kalau belum ada. Idempotent + safe
// dipanggil di hot path (cuma 1 query lookup, 1 query create kalau lazy).
export async function getActiveLmsQuota(
  userId: string,
): Promise<ActiveLmsQuota> {
  const row = await prisma.lmsQuota.findUnique({
    where: { userId },
    select: {
      tier: true,
      maxCourses: true,
      maxLessonsPerCourse: true,
      maxStudentsPerCourse: true,
      maxFileStorageMB: true,
      canUseDripSchedule: true,
      canIssueCertificate: true,
    },
  })
  if (row) return row
  // Lazy-create FREE row supaya tidak loop terus.
  await prisma.lmsQuota
    .create({
      data: { userId, tier: 'FREE', ...FREE_DEFAULT },
    })
    .catch(() => {})
  return { tier: 'FREE', ...FREE_DEFAULT }
}

// Upsert dgn data dari LmsUpgradePackage. Dipanggil di service
// lms-subscription saat checkout sukses.
export async function applyQuotaFromPackage(input: {
  userId: string
  pkg: {
    tier: string
    maxCourses: number
    maxLessonsPerCourse: number
    maxStudentsPerCourse: number
    maxFileStorageMB: number
    canUseDripSchedule: boolean
    canIssueCertificate: boolean
  }
}): Promise<LmsQuota> {
  const data = {
    tier: input.pkg.tier as 'FREE' | 'BASIC' | 'PRO' | 'UNLIMITED',
    maxCourses: input.pkg.maxCourses,
    maxLessonsPerCourse: input.pkg.maxLessonsPerCourse,
    maxStudentsPerCourse: input.pkg.maxStudentsPerCourse,
    maxFileStorageMB: input.pkg.maxFileStorageMB,
    canUseDripSchedule: input.pkg.canUseDripSchedule,
    canIssueCertificate: input.pkg.canIssueCertificate,
  }
  return prisma.lmsQuota.upsert({
    where: { userId: input.userId },
    create: { userId: input.userId, ...data },
    update: data,
  })
}

// Downgrade ke FREE — dipanggil cron saat LmsSubscription EXPIRED + user
// tidak punya subscription ACTIVE lain.
export async function downgradeToFree(userId: string): Promise<void> {
  await prisma.lmsQuota.upsert({
    where: { userId },
    create: { userId, tier: 'FREE', ...FREE_DEFAULT },
    update: { tier: 'FREE', ...FREE_DEFAULT },
  })
}

// -1 = unlimited. Helper supaya service tidak duplicate logic.
export function isUnlimited(limit: number): boolean {
  return limit < 0
}

export function checkLimitOrThrow(
  current: number,
  limit: number,
  label: string,
): void {
  if (isUnlimited(limit)) return
  if (current >= limit) {
    const err = new Error(
      `Limit ${label} tercapai (${current}/${limit}). Upgrade plan LMS untuk tambah quota.`,
    )
    ;(err as Error & { code?: string }).code = 'LMS_QUOTA_EXCEEDED'
    throw err
  }
}
