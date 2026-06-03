// POST /api/admin/host-templates/upload — upload referensi gambar admin
// (produk / mood / pose). Sharp → webp (max 1024px) → simpan.
//
// Lokasi: /public/uploads/host-refs/<adminUserId>/<random>.webp
// Return URL public-relative — di-pass ke create-template payload.
import { randomBytes } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

import type { NextResponse } from 'next/server'
import sharp from 'sharp'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'

const MAX_RAW_BYTES = 10 * 1024 * 1024 // 10 MB raw
const MAX_DIMENSION = 1024
const WEBP_QUALITY = 86
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export async function POST(req: Request) {
  let session
  try {
    session = await requireAdmin()
  } catch (res) {
    return res as NextResponse
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
    const webp = await sharp(buf)
      .rotate()
      .resize(MAX_DIMENSION, MAX_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer()

    const filename = `${randomBytes(12).toString('hex')}.webp`
    const dir = path.join(
      process.cwd(),
      'public',
      'uploads',
      'host-refs',
      session.user.id,
    )
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, filename), webp)

    const url = `/uploads/host-refs/${session.user.id}/${filename}`
    return jsonOk({ url, size: webp.length })
  } catch (err) {
    console.error('[POST /api/admin/host-templates/upload] gagal:', err)
    return jsonError('Gagal proses gambar', 500)
  }
}
