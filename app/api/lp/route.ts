// GET  /api/lp — list LP milik user (untuk halaman manager)
// POST /api/lp — buat LP baru (cek kuota + slug uniqueness)
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { checkLpQuota, getUserQuota } from '@/lib/lp-quota'
import { prisma } from '@/lib/prisma'
import { lpCreateSchema } from '@/lib/validations/lp'

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const [pages, quota, current] = await Promise.all([
      prisma.landingPage.findMany({
        where: { userId: session.user.id },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          slug: true,
          isPublished: true,
          viewCount: true,
          metaTitle: true,
          metaDesc: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      getUserQuota(session.user.id),
      prisma.landingPage.count({ where: { userId: session.user.id } }),
    ])
    return jsonOk({
      pages: pages.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      quota: {
        tier: quota.tier,
        maxLp: quota.maxLp,
        currentLp: current,
        maxStorageMB: quota.maxStorageMB,
        storageUsedMB: quota.storageUsedMB,
      },
    })
  } catch (err) {
    console.error('[GET /api/lp] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const parsed = lpCreateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }

  try {
    const quotaCheck = await checkLpQuota(session.user.id)
    if (!quotaCheck.ok) {
      return jsonError(quotaCheck.reason ?? 'Kuota LP penuh', 403)
    }

    // Cek slug uniqueness manual supaya pesan errornya ramah —
    // kalau langsung pakai unique constraint, error generic dari Prisma.
    const existing = await prisma.landingPage.findUnique({
      where: { slug: parsed.data.slug },
      select: { id: true },
    })
    if (existing) {
      return jsonError('Slug sudah dipakai LP lain. Pilih slug yang berbeda.', 409)
    }

    const created = await prisma.landingPage.create({
      data: {
        userId: session.user.id,
        title: parsed.data.title,
        slug: parsed.data.slug,
        htmlContent: '',
      },
      select: { id: true, title: true, slug: true, isPublished: true },
    })
    return jsonOk(created, 201)
  } catch (err) {
    console.error('[POST /api/lp] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
