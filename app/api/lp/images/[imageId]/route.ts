// DELETE /api/lp/images/[imageId] — hapus gambar (file + DB row + kurangi storage).
import { unlink } from 'fs/promises'
import path from 'path'

import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { updateStorageUsed } from '@/lib/lp-quota'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ imageId: string }>
}

export async function DELETE(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const { imageId } = await params

  try {
    const image = await prisma.lpImage.findUnique({
      where: { id: imageId },
      select: { id: true, userId: true, filename: true, size: true },
    })
    if (!image) return jsonError('Gambar tidak ditemukan', 404)
    if (image.userId !== session.user.id) {
      return jsonError('Forbidden', 403)
    }

    // Hapus file dari disk. Errornya kita log saja — kalau file sudah hilang
    // (edge case), DB row tetap perlu dihapus.
    const filePath = path.join(
      process.cwd(),
      'public',
      'uploads',
      'lp-images',
      image.userId,
      image.filename,
    )
    try {
      await unlink(filePath)
    } catch (fsErr) {
      console.warn(
        '[DELETE /api/lp/images/:id] file tidak ditemukan di disk:',
        fsErr,
      )
    }

    await prisma.lpImage.delete({ where: { id: imageId } })

    // Kurangi storage usage. Pakai ukuran asli yang tersimpan di DB.
    const sizeMB = image.size / (1024 * 1024)
    await updateStorageUsed(session.user.id, -sizeMB)

    return jsonOk({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/lp/images/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
