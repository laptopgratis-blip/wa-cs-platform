// GET    /api/ebooks/[id] — detail e-book milik user.
// PATCH  /api/ebooks/[id] — edit metadata / ganti file (file lama dihapus).
// DELETE /api/ebooks/[id] — hapus e-book + file; DITOLAK kalau sudah ada
//                           pembeli (entitlement) — matikan isActive saja
//                           supaya hak pembeli lama tetap hidup.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { deleteEbookFile, ebookFileExists } from '@/lib/ebook-storage'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import { ebookUpdateSchema } from '@/lib/validations/ebook'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  try {
    const ebook = await prisma.ebook.findFirst({
      where: { id, userId: session.user.id },
      include: {
        _count: { select: { entitlements: true } },
        product: { select: { id: true, name: true } },
      },
    })
    if (!ebook) return jsonError('E-book tidak ditemukan', 404)
    return jsonOk({
      ...ebook,
      createdAt: ebook.createdAt.toISOString(),
      updatedAt: ebook.updatedAt.toISOString(),
    })
  } catch (err) {
    console.error('[GET /api/ebooks/[id]] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  const json = await req.json().catch(() => null)
  const parsed = ebookUpdateSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }
  try {
    const existing = await prisma.ebook.findFirst({
      where: { id, userId: session.user.id },
    })
    if (!existing) return jsonError('E-book tidak ditemukan', 404)

    const data = parsed.data

    // Ganti file: validasi kepemilikan + eksistensi file baru dulu, update
    // row, baru hapus file lama (urutan ini supaya kegagalan update tidak
    // menghilangkan file yang masih dipakai).
    if (data.file) {
      if (!data.file.filePath.startsWith(`${session.user.id}/`)) {
        return jsonError('File tidak valid', 400)
      }
      if (data.file.filePath !== existing.filePath) {
        if (!(await ebookFileExists(data.file.filePath))) {
          return jsonError(
            'File tidak ditemukan di storage — upload ulang dulu',
            400,
          )
        }
      }
    }

    const updated = await prisma.ebook.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && {
          description: data.description,
        }),
        ...(data.coverUrl !== undefined && { coverUrl: data.coverUrl }),
        ...(data.maxDownloads !== undefined && {
          maxDownloads: data.maxDownloads,
        }),
        ...(data.accessDays !== undefined && { accessDays: data.accessDays }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.file && {
          fileName: data.file.fileName,
          filePath: data.file.filePath,
          fileFormat: data.file.fileFormat,
          fileSizeBytes: data.file.fileSizeBytes,
          fileSha256: data.file.fileSha256,
        }),
      },
    })

    // File lama jadi sampah setelah row menunjuk file baru — hapus best-effort.
    if (data.file && data.file.filePath !== existing.filePath) {
      await deleteEbookFile(existing.filePath)
    }

    return jsonOk({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    })
  } catch (err) {
    console.error('[PATCH /api/ebooks/[id]] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  try {
    const existing = await prisma.ebook.findFirst({
      where: { id, userId: session.user.id },
      include: { _count: { select: { entitlements: true } } },
    })
    if (!existing) return jsonError('E-book tidak ditemukan', 404)

    // Sudah ada pembeli → hapus akan mematikan hak akses mereka (cascade).
    // Arahkan seller nonaktifkan saja (isActive=false = tidak bisa dijual
    // lagi, pembeli lama tetap bisa download).
    if (existing._count.entitlements > 0) {
      return jsonError(
        'E-book sudah punya pembeli — nonaktifkan saja supaya pembeli lama tetap bisa mengakses',
        400,
      )
    }

    await prisma.ebook.delete({ where: { id } })
    await deleteEbookFile(existing.filePath)

    return jsonOk({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/ebooks/[id]] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
