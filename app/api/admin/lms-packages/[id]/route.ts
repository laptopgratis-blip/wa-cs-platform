// PATCH  /api/admin/lms-packages/[id]  — update plan (ADMIN)
// DELETE /api/admin/lms-packages/[id]  — soft = isActive=false (recommended)
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ id: string }>
}

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional().nullable(),
  maxCourses: z.number().int().optional(),
  maxLessonsPerCourse: z.number().int().optional(),
  maxStudentsPerCourse: z.number().int().optional(),
  maxFileStorageMB: z.number().int().min(0).optional(),
  canUseDripSchedule: z.boolean().optional(),
  canIssueCertificate: z.boolean().optional(),
  priceMonthly: z.number().int().min(0).optional(),
  isPopular: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

export async function PATCH(req: Request, { params }: Params) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  const parsed = updateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  try {
    const pkg = await prisma.lmsUpgradePackage.update({
      where: { id },
      data: parsed.data,
    })
    return jsonOk({ package: pkg })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Gagal update', 400)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  try {
    // Hard delete blok kalau masih ada subscription. Soft delete via PATCH
    // isActive=false lebih aman.
    const sub = await prisma.lmsSubscription.findFirst({
      where: { lmsPackageId: id },
      select: { id: true },
    })
    if (sub) {
      return jsonError(
        'Paket masih punya subscription aktif/historis. Set isActive=false aja.',
        400,
      )
    }
    await prisma.lmsUpgradePackage.delete({ where: { id } })
    return jsonOk({ ok: true })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Gagal hapus', 400)
  }
}
