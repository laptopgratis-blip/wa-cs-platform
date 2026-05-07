// POST /api/products/upload — multipart/form-data dengan field "file".
// Pipeline: validate type/size → sharp resize+webp → simpan ke
// /public/uploads/products/<userId>/<random>.webp → return URL.
import { randomBytes } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

import type { NextResponse } from 'next/server'
import sharp from 'sharp'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'

const MAX_RAW_BYTES = 8 * 1024 * 1024  // 8 MB raw input
const MAX_DIMENSION = 1200             // px, fit inside
const WEBP_QUALITY = 82
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export async function POST(req: Request) {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
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
    return jsonError(
      `Ukuran maksimal ${MAX_RAW_BYTES / 1024 / 1024} MB`,
      400,
    )
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
      'products',
      session.user.id,
    )
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, filename), webp)

    const url = `/uploads/products/${session.user.id}/${filename}`
    return jsonOk({ url, size: webp.length })
  } catch (err) {
    console.error('[POST /api/products/upload] gagal:', err)
    return jsonError('Gagal proses gambar', 500)
  }
}
