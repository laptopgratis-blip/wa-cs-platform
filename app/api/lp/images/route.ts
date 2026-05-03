// GET  /api/lp/images — list semua gambar milik user yang login.
// POST /api/lp/images — upload gambar (multipart/form-data, field "file" + opsional "lpId").
import { randomBytes } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import {
  checkStorageQuota,
  updateStorageUsed,
} from '@/lib/lp-quota'
import { prisma } from '@/lib/prisma'

const MAX_BYTES = 2 * 1024 * 1024 // 2 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const images = await prisma.lpImage.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        filename: true,
        originalName: true,
        url: true,
        size: true,
        mimeType: true,
        lpId: true,
        createdAt: true,
      },
    })
    return jsonOk(
      images.map((img) => ({
        ...img,
        createdAt: img.createdAt.toISOString(),
      })),
    )
  } catch (err) {
    console.error('[GET /api/lp/images] gagal:', err)
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

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return jsonError('Format upload tidak valid (butuh multipart/form-data)')
  }

  const file = form.get('file')
  const lpIdRaw = form.get('lpId')
  const lpId = typeof lpIdRaw === 'string' && lpIdRaw.trim() ? lpIdRaw.trim() : null

  if (!(file instanceof File)) {
    return jsonError('File gambar tidak ditemukan')
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return jsonError('Tipe file harus JPG, PNG, WebP, atau GIF')
  }
  if (file.size > MAX_BYTES) {
    return jsonError('Ukuran file maksimal 2 MB')
  }

  try {
    // Kalau lpId dikirim, pastikan LP itu memang milik user.
    if (lpId) {
      const lp = await prisma.landingPage.findUnique({
        where: { id: lpId },
        select: { userId: true },
      })
      if (!lp || lp.userId !== session.user.id) {
        return jsonError('Landing page tidak ditemukan', 404)
      }
    }

    // Cek kuota storage SEBELUM tulis file ke disk.
    const fileSizeMB = file.size / (1024 * 1024)
    const quotaCheck = await checkStorageQuota(session.user.id, fileSizeMB)
    if (!quotaCheck.ok) {
      return jsonError(quotaCheck.reason ?? 'Storage tidak cukup', 413)
    }

    const ext = EXT_BY_TYPE[file.type] ?? 'jpg'
    const filename = `${randomBytes(10).toString('hex')}.${ext}`
    const dir = path.join(
      process.cwd(),
      'public',
      'uploads',
      'lp-images',
      session.user.id,
    )
    await mkdir(dir, { recursive: true })

    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(path.join(dir, filename), buffer)

    const url = `/uploads/lp-images/${session.user.id}/${filename}`

    const created = await prisma.lpImage.create({
      data: {
        userId: session.user.id,
        lpId,
        filename,
        originalName: file.name,
        url,
        size: file.size,
        mimeType: file.type,
      },
      select: {
        id: true,
        filename: true,
        originalName: true,
        url: true,
        size: true,
        mimeType: true,
        lpId: true,
        createdAt: true,
      },
    })

    await updateStorageUsed(session.user.id, fileSizeMB)

    return jsonOk(
      { ...created, createdAt: created.createdAt.toISOString() },
      201,
    )
  } catch (err) {
    console.error('[POST /api/lp/images] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
