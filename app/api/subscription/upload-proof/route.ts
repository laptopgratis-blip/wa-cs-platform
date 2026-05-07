// POST /api/subscription/upload-proof
// User upload bukti transfer manual untuk subscription invoice.
// Body: multipart/form-data dengan field "file" (image) + "invoiceId".
//
// Validasi: invoice milik user, status PENDING, paymentMethod MANUAL_TRANSFER.
// File: max 2 MB raw, JPG/PNG/WebP, di-compress sharp jadi WebP.
// Setelah upload, status invoice → WAITING_CONFIRMATION (admin yg approve).
import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { NextResponse } from 'next/server'
import sharp from 'sharp'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/services/subscription'

const MAX_RAW_BYTES = 2 * 1024 * 1024 // 2 MB raw — bukti transfer biasanya kecil
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

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
  const invoiceId = form.get('invoiceId')
  const note = form.get('note')

  if (typeof invoiceId !== 'string' || !invoiceId) {
    return jsonError('invoiceId tidak valid')
  }
  if (!(file instanceof File)) {
    return jsonError('File bukti transfer tidak ditemukan')
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return jsonError('Tipe file harus JPG, PNG, atau WebP')
  }
  if (file.size > MAX_RAW_BYTES) {
    return jsonError(
      `Ukuran file maksimal ${MAX_RAW_BYTES / 1024 / 1024} MB`,
    )
  }

  try {
    const invoice = await prisma.subscriptionInvoice.findUnique({
      where: { id: invoiceId },
      include: { subscription: true },
    })
    if (!invoice) return jsonError('Invoice tidak ditemukan', 404)
    if (invoice.subscription.userId !== session.user.id) {
      return jsonError('Forbidden', 403)
    }
    if (invoice.paymentMethod !== 'MANUAL_TRANSFER') {
      return jsonError('Invoice ini bukan transfer manual')
    }
    if (invoice.status !== 'PENDING') {
      return jsonError(
        `Invoice tidak bisa di-upload bukti (status: ${invoice.status})`,
      )
    }

    // Compress to WebP — hemat storage + standardisasi.
    const rawBuf = Buffer.from(await file.arrayBuffer())
    const compressed = await sharp(rawBuf)
      .rotate()
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85, effort: 4 })
      .toBuffer()

    const filename = `${randomBytes(10).toString('hex')}.webp`
    const dir = path.join(process.cwd(), 'public', 'uploads', 'payment-proofs')
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, filename), compressed)
    const url = `/uploads/payment-proofs/${filename}`

    const updated = await prisma.subscriptionInvoice.update({
      where: { id: invoice.id },
      data: {
        manualProofUrl: url,
        manualNote: typeof note === 'string' ? note.slice(0, 1000) : null,
        status: 'WAITING_CONFIRMATION',
      },
    })

    // Notif ke semua admin (in-app) bahwa ada bukti baru.
    const admins = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'FINANCE'] } },
      select: { id: true },
    })
    for (const admin of admins) {
      await createNotification({
        userId: admin.id,
        subscriptionId: invoice.subscriptionId,
        type: 'MANUAL_PROOF_UPLOADED',
        channel: 'IN_APP',
        title: '🧾 Bukti Transfer Baru',
        message: `Ada user upload bukti transfer untuk invoice ${invoice.invoiceNumber}. Cek di /admin/subscriptions.`,
        link: `/admin/subscriptions`,
      }).catch(() => {})
    }

    return jsonOk({
      invoiceId: updated.id,
      status: updated.status,
      proofUrl: url,
    })
  } catch (err) {
    console.error('[POST /api/subscription/upload-proof] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
