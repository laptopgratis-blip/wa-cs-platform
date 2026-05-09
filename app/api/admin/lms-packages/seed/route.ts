// POST /api/admin/lms-packages/seed — idempotent seed default tier per
// blueprint Phase 3. Admin set harga sendiri sesudah seed.
//
// Default values per blueprint architecture:
//   FREE       1 course, 5 lesson, 50 student, 0MB, no drip/cert, harga 0
//   BASIC      5 course, 20 lesson, 500 student, 200MB, no drip/cert
//   PRO        20 course, ∞ lesson, 5000 student, 1000MB, drip+cert
//   UNLIMITED  ∞ semua, drip+cert
//
// Idempotent via unique tier — kalau row sudah ada, skip (tidak overwrite
// harga yg sudah di-set admin).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'

const SEED = [
  {
    name: 'Free',
    tier: 'FREE' as const,
    description: 'Coba LMS gratis — 1 course, 5 lesson untuk validasi flow.',
    maxCourses: 1,
    maxLessonsPerCourse: 5,
    maxStudentsPerCourse: 50,
    maxFileStorageMB: 0,
    canUseDripSchedule: false,
    canIssueCertificate: false,
    priceMonthly: 0,
    isPopular: false,
    sortOrder: 0,
  },
  {
    name: 'Basic',
    tier: 'BASIC' as const,
    description: 'Untuk creator pemula — 5 course, 20 lesson per course.',
    maxCourses: 5,
    maxLessonsPerCourse: 20,
    maxStudentsPerCourse: 500,
    maxFileStorageMB: 200,
    canUseDripSchedule: false,
    canIssueCertificate: false,
    priceMonthly: 0, // admin set sendiri
    isPopular: false,
    sortOrder: 1,
  },
  {
    name: 'Pro',
    tier: 'PRO' as const,
    description: 'Untuk profesional — unlimited lesson + drip + certificate.',
    maxCourses: 20,
    maxLessonsPerCourse: -1,
    maxStudentsPerCourse: 5000,
    maxFileStorageMB: 1000,
    canUseDripSchedule: true,
    canIssueCertificate: true,
    priceMonthly: 0,
    isPopular: true,
    sortOrder: 2,
  },
  {
    name: 'Unlimited',
    tier: 'UNLIMITED' as const,
    description: 'No limits — untuk academy/school dgn katalog besar.',
    maxCourses: -1,
    maxLessonsPerCourse: -1,
    maxStudentsPerCourse: -1,
    maxFileStorageMB: 5000,
    canUseDripSchedule: true,
    canIssueCertificate: true,
    priceMonthly: 0,
    isPopular: false,
    sortOrder: 3,
  },
]

export async function POST() {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const created: string[] = []
  const skipped: string[] = []
  for (const s of SEED) {
    const existing = await prisma.lmsUpgradePackage.findUnique({
      where: { tier: s.tier },
    })
    if (existing) {
      skipped.push(s.tier)
      continue
    }
    await prisma.lmsUpgradePackage.create({ data: s })
    created.push(s.tier)
  }
  return jsonOk({ created, skipped })
}
