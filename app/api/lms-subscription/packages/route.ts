// GET /api/lms-subscription/packages
// List paket LMS aktif (FREE + paid). Dipakai onboarding wizard untuk pilih
// plan tanpa harus buka /pricing-lms. Public ke user terotentikasi.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const packages = await prisma.lmsUpgradePackage.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { priceMonthly: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        tier: true,
        maxCourses: true,
        maxLessonsPerCourse: true,
        maxStudentsPerCourse: true,
        priceMonthly: true,
        isPopular: true,
      },
    })
    return jsonOk({ packages })
  } catch (err) {
    console.error('[GET /api/lms-subscription/packages] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
