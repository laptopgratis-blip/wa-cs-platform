// POST /api/orders/[invoiceNumber]/upload-proof (PUBLIC, no-auth)
// Customer upload bukti transfer langsung dari halaman invoice. Validasi
// pakai invoiceNumber yang sudah dipegang customer (semi-secret URL).
import { randomBytes } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

import sharp from 'sharp'

import { jsonError, jsonOk } from '@/lib/api'
import { notifyProofUploaded } from '@/lib/services/order-notif'
import { prisma } from '@/lib/prisma'

const MAX_RAW_BYTES = 4 * 1024 * 1024  // 4 MB raw input
const MAX_DIMENSION = 1600
const WEBP_QUALITY = 80
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // `id` di URL = invoiceNumber (folder /api/orders/[id]/ shared dengan
  // detail order admin yang juga pakai param `id`).
  const { id: invoiceNumber } = await params

  const order = await prisma.userOrder.findUnique({
    where: { invoiceNumber },
    select: {
      id: true,
      userId: true,
      paymentMethod: true,
      paymentStatus: true,
    },
  })
  if (!order) return jsonError('Invoice tidak ditemukan', 404)
  if (order.paymentMethod !== 'TRANSFER') {
    return jsonError(
      'Order ini bukan TRANSFER — tidak butuh bukti pembayaran',
      400,
    )
  }
  if (
    order.paymentStatus === 'PAID' ||
    order.paymentStatus === 'CANCELLED'
  ) {
    return jsonError(
      `Order sudah ${order.paymentStatus.toLowerCase()}, tidak bisa upload bukti baru`,
      400,
    )
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

    const filename = `${invoiceNumber}-${randomBytes(6).toString('hex')}.webp`
    const dir = path.join(
      process.cwd(),
      'public',
      'uploads',
      'payment-proofs',
      order.userId,
    )
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, filename), webp)

    const url = `/uploads/payment-proofs/${order.userId}/${filename}`

    await prisma.userOrder.update({
      where: { id: order.id },
      data: {
        paymentProofUrl: url,
        paymentStatus: 'WAITING_CONFIRMATION',
      },
    })

    // Notif WA owner — fire-and-forget.
    notifyProofUploaded(order.id).catch(() => {})

    return jsonOk({ url, status: 'WAITING_CONFIRMATION' })
  } catch (err) {
    console.error('[POST /api/orders/upload-proof] gagal:', err)
    return jsonError('Gagal proses bukti', 500)
  }
}
