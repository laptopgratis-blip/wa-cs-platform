// GET  /api/admin/lms-packages — list semua plan (admin: ADMIN; non-admin
//   tetap dapat lihat tapi cuma yg isActive untuk display di /pricing-lms).
// POST /api/admin/lms-packages — create plan (ADMIN only).
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireAdmin, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const url = new URL(req.url)
  const onlyActive = url.searchParams.get('active') === '1'
  const isAdmin = session.user.role === 'ADMIN'
  const packages = await prisma.lmsUpgradePackage.findMany({
    where: isAdmin && !onlyActive ? {} : { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { priceMonthly: 'asc' }],
  })
  return jsonOk({ packages })
}

const tierEnum = z.enum(['FREE', 'BASIC', 'PRO', 'UNLIMITED'])
const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional().nullable(),
  tier: tierEnum,
  maxCourses: z.number().int(),
  maxLessonsPerCourse: z.number().int(),
  maxStudentsPerCourse: z.number().int(),
  maxFileStorageMB: z.number().int().min(0).optional(),
  canUseDripSchedule: z.boolean().optional(),
  canIssueCertificate: z.boolean().optional(),
  priceMonthly: z.number().int().min(0).optional(),
  isPopular: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

export async function POST(req: Request) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  try {
    const pkg = await prisma.lmsUpgradePackage.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        tier: parsed.data.tier,
        maxCourses: parsed.data.maxCourses,
        maxLessonsPerCourse: parsed.data.maxLessonsPerCourse,
        maxStudentsPerCourse: parsed.data.maxStudentsPerCourse,
        maxFileStorageMB: parsed.data.maxFileStorageMB ?? 0,
        canUseDripSchedule: parsed.data.canUseDripSchedule ?? false,
        canIssueCertificate: parsed.data.canIssueCertificate ?? false,
        priceMonthly: parsed.data.priceMonthly ?? 0,
        isPopular: parsed.data.isPopular ?? false,
        isActive: parsed.data.isActive ?? true,
        sortOrder: parsed.data.sortOrder ?? 0,
      },
    })
    return jsonOk({ package: pkg })
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : 'Gagal create',
      400,
    )
  }
}
