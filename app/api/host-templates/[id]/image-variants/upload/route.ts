// POST /api/host-templates/[id]/image-variants/upload — multipart `file`.
// Upload gambar host hasil edit eksternal (mis. produk sudah di-composite ukuran
// pas) sebagai kandidat baru. Disimpan FULL-RES (PNG/JPEG, rasio 9:16 dijaga) —
// bukan webp-1024 seperti /host-templates/upload — karena dipakai langsung
// sebagai source image Kling. Tidak auto-aktif; owner pilih "Pakai ini".
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { NextResponse } from 'next/server'
import sharp from 'sharp'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import {
  appendImageVariant,
  newVariantId,
} from '@/lib/services/host-gen/image-variants'

const MAX_RAW_BYTES = 15 * 1024 * 1024
const MAX_DIMENSION = 1536 // cukup tajam untuk Kling, tetap bound ukuran file
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params

  const host = await prisma.hostTemplate.findUnique({
    where: { id },
    select: { id: true, userId: true },
  })
  if (!host) return jsonError('Host template tidak ditemukan', 404)
  if (session.user.role !== 'ADMIN' && host.userId !== session.user.id) {
    return jsonError('Tidak punya akses ke host ini', 403)
  }

  const form = await req.formData().catch(() => null)
  if (!form) return jsonError('Form invalid', 400)
  const file = form.get('file')
  if (!(file instanceof File)) return jsonError('File tidak ditemukan', 400)
  if (!ALLOWED_TYPES.includes(file.type)) {
    return jsonError('Format harus JPG, PNG, atau WebP', 400)
  }
  if (file.size > MAX_RAW_BYTES) {
    return jsonError(`Ukuran maksimal ${MAX_RAW_BYTES / 1024 / 1024} MB`, 400)
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const pipeline = sharp(buf)
      .rotate()
      .resize(MAX_DIMENSION, MAX_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      })
    // Pertahankan JPEG kalau sumbernya JPEG (file kecil), selain itu PNG (lossless).
    const isJpeg = file.type === 'image/jpeg'
    const out = isJpeg
      ? await pipeline.jpeg({ quality: 92 }).toBuffer()
      : await pipeline.png({ compressionLevel: 9 }).toBuffer()
    const ext = isJpeg ? 'jpg' : 'png'

    const filename = `${newVariantId()}.${ext}`
    const dir = path.join(
      process.cwd(),
      'public',
      'uploads',
      'host-images',
      host.userId,
    )
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, filename), out)
    const url = `/uploads/host-images/${host.userId}/${filename}`

    const variant = {
      id: newVariantId(),
      url,
      source: 'UPLOADED' as const,
      label: 'Upload (edit)',
      createdAt: new Date().toISOString(),
    }
    await appendImageVariant(host.id, variant)
    return jsonOk({ variant, size: out.length })
  } catch (err) {
    console.error('[image-variants/upload] gagal:', err)
    return jsonError('Gagal proses gambar', 500)
  }
}
