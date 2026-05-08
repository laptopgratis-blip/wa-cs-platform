// GET    /api/lp/[lpId] — detail untuk editor
// PATCH  /api/lp/[lpId] — update field (title/slug/htmlContent/meta/isPublished)
// DELETE /api/lp/[lpId] — hapus LP + semua LpImage terkait + update storage
import { unlink } from 'fs/promises'
import path from 'path'

import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { updateStorageUsed } from '@/lib/lp-quota'
import { prisma } from '@/lib/prisma'
import { lpUpdateSchema } from '@/lib/validations/lp'

// HTML LP bisa sampai 10 MB (limit Zod di lib/validations/lp.ts). Naikkan
// timeout supaya parse + save tidak ke-cut default 10 detik.
export const maxDuration = 60

interface Params {
  params: Promise<{ lpId: string }>
}

async function loadOwned(lpId: string, userId: string) {
  const lp = await prisma.landingPage.findUnique({ where: { id: lpId } })
  if (!lp) return { error: jsonError('Landing page tidak ditemukan', 404) }
  if (lp.userId !== userId) return { error: jsonError('Forbidden', 403) }
  return { lp }
}

export async function GET(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { lpId } = await params
  try {
    const { lp, error } = await loadOwned(lpId, session.user.id)
    if (error) return error
    return jsonOk({
      ...lp,
      createdAt: lp.createdAt.toISOString(),
      updatedAt: lp.updatedAt.toISOString(),
    })
  } catch (err) {
    console.error('[GET /api/lp/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function PATCH(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { lpId } = await params

  const parsed = lpUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }

  try {
    const { lp, error } = await loadOwned(lpId, session.user.id)
    if (error) return error

    // Kalau slug diubah, pastikan unik global.
    if (parsed.data.slug && parsed.data.slug !== lp.slug) {
      const existing = await prisma.landingPage.findUnique({
        where: { slug: parsed.data.slug },
        select: { id: true },
      })
      if (existing && existing.id !== lp.id) {
        return jsonError('Slug sudah dipakai LP lain.', 409)
      }
    }

    const updated = await prisma.landingPage.update({
      where: { id: lp.id },
      data: parsed.data,
    })
    return jsonOk({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    })
  } catch (err) {
    console.error('[PATCH /api/lp/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { lpId } = await params

  try {
    const { lp, error } = await loadOwned(lpId, session.user.id)
    if (error) return error

    // Ambil semua image yang lpId-nya == LP ini supaya bisa hapus file & update storage.
    // Image yang lpId-nya null (di library tapi belum dipasang) tidak ikut terhapus.
    const images = await prisma.lpImage.findMany({
      where: { lpId: lp.id },
      select: { id: true, filename: true, size: true, userId: true },
    })

    let totalBytesFreed = 0
    for (const img of images) {
      const filePath = path.join(
        process.cwd(),
        'public',
        'uploads',
        'lp-images',
        img.userId,
        img.filename,
      )
      try {
        await unlink(filePath)
      } catch (fsErr) {
        console.warn('[DELETE /api/lp/:id] file tidak ditemukan:', fsErr)
      }
      totalBytesFreed += img.size
    }

    // Hapus LP — image rows ikut hilang lewat Prisma transaction (delete cascade
    // tidak ke LpImage karena onDelete: SetNull di schema). Hapus eksplisit.
    await prisma.$transaction([
      prisma.lpImage.deleteMany({ where: { lpId: lp.id } }),
      prisma.landingPage.delete({ where: { id: lp.id } }),
    ])

    if (totalBytesFreed > 0) {
      const freedMB = totalBytesFreed / (1024 * 1024)
      await updateStorageUsed(session.user.id, -freedMB)
    }

    return jsonOk({ deleted: true, imagesDeleted: images.length })
  } catch (err) {
    console.error('[DELETE /api/lp/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
