// GET  /api/ebooks — list e-book milik user (+jumlah pembeli & produk link).
// POST /api/ebooks — buat e-book baru dari metadata hasil /api/ebooks/upload.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { ebookFileExists } from '@/lib/ebook-storage'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import {
  EBOOK_LIMIT_PER_USER,
  ebookCreateSchema,
} from '@/lib/validations/ebook'

export async function GET() {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }
  try {
    const items = await prisma.ebook.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { entitlements: true } },
        product: { select: { id: true, name: true } },
      },
    })
    return jsonOk({
      items: items.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      })),
      limit: EBOOK_LIMIT_PER_USER,
      used: items.length,
    })
  } catch (err) {
    console.error('[GET /api/ebooks] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function POST(req: Request) {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }
  const json = await req.json().catch(() => null)
  const parsed = ebookCreateSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }
  try {
    const data = parsed.data

    // filePath wajib milik user ini (prefix userId) — mencegah mengklaim
    // file user lain. Format path divalidasi ebookFileExists (assertSafe).
    if (!data.file.filePath.startsWith(`${session.user.id}/`)) {
      return jsonError('File tidak valid', 400)
    }
    if (!(await ebookFileExists(data.file.filePath))) {
      return jsonError(
        'File tidak ditemukan di storage — upload ulang dulu',
        400,
      )
    }

    const count = await prisma.ebook.count({
      where: { userId: session.user.id },
    })
    if (count >= EBOOK_LIMIT_PER_USER) {
      return jsonError(
        `Sudah mencapai batas ${EBOOK_LIMIT_PER_USER} e-book. Hapus yang tidak terpakai untuk menambah baru.`,
        409,
      )
    }

    const created = await prisma.ebook.create({
      data: {
        userId: session.user.id,
        title: data.title,
        description: data.description ?? null,
        coverUrl: data.coverUrl ?? null,
        fileName: data.file.fileName,
        filePath: data.file.filePath,
        fileFormat: data.file.fileFormat,
        fileSizeBytes: data.file.fileSizeBytes,
        fileSha256: data.file.fileSha256,
        maxDownloads: data.maxDownloads,
        accessDays: data.accessDays ?? null,
        isActive: data.isActive ?? true,
      },
    })
    return jsonOk(
      {
        ...created,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
      201,
    )
  } catch (err) {
    console.error('[POST /api/ebooks] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
