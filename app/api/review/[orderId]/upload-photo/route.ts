// POST /api/review/[orderId]/upload-photo (PUBLIC, token-gated)
// Customer upload foto testimoni. Token HMAC (?t=) mengikat orderId+purpose.
// Sharp → webp, simpan ke /public/uploads/reviews/<userId>/.
import { randomBytes } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

import sharp from 'sharp'

import { jsonError, jsonOk } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { verifyReviewToken } from '@/lib/review-token'

const MAX_RAW_BYTES = 6 * 1024 * 1024 // 6 MB
const MAX_DIMENSION = 1280
const WEBP_QUALITY = 80
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params
  const token = new URL(req.url).searchParams.get('t')
  if (!verifyReviewToken(orderId, 'review', token)) {
    return jsonError('Link tidak valid', 403)
  }

  const order = await prisma.userOrder.findUnique({
    where: { id: orderId },
    select: { id: true, userId: true },
  })
  if (!order) return jsonError('Order tidak ditemukan', 404)

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

    const filename = `${randomBytes(8).toString('hex')}.webp`
    const dir = path.join(
      process.cwd(),
      'public',
      'uploads',
      'reviews',
      order.userId,
    )
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, filename), webp)

    const url = `/uploads/reviews/${order.userId}/${filename}`
    return jsonOk({ url })
  } catch (err) {
    console.error('[POST /api/review/upload-photo] gagal:', err)
    return jsonError('Gagal proses foto', 500)
  }
}
