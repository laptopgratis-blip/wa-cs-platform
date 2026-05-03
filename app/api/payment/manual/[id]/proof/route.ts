// POST /api/payment/manual/[id]/proof
// Multipart form-data: file (image, max 2MB), note (optional string)
//
// Simpan ke /public/uploads/proofs/ dengan nama random. Tidak hash isi
// file — kita hanya butuh URL stable & non-guessable.
import { randomBytes } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

const MAX_BYTES = 2 * 1024 * 1024 // 2 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const { id } = await params

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return jsonError('Format upload tidak valid (butuh multipart/form-data)')
  }

  const file = form.get('file')
  const note = (form.get('note') as string | null)?.trim() || null

  if (!(file instanceof File)) {
    return jsonError('File bukti tidak ditemukan')
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return jsonError('Tipe file harus JPG, PNG, atau WebP')
  }
  if (file.size > MAX_BYTES) {
    return jsonError('Ukuran file maksimal 2 MB')
  }

  try {
    const payment = await prisma.manualPayment.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true },
    })
    if (!payment) return jsonError('Order tidak ditemukan', 404)
    if (payment.userId !== session.user.id) {
      return jsonError('Forbidden', 403)
    }
    if (payment.status !== 'PENDING') {
      return jsonError(
        'Order ini sudah diproses, tidak bisa upload ulang bukti.',
      )
    }

    // Simpan file ke /public/uploads/proofs/
    const ext = EXT_BY_TYPE[file.type] ?? 'jpg'
    const filename = `${id}-${randomBytes(6).toString('hex')}.${ext}`
    const dir = path.join(process.cwd(), 'public', 'uploads', 'proofs')
    await mkdir(dir, { recursive: true })

    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(path.join(dir, filename), buffer)

    const proofUrl = `/uploads/proofs/${filename}`

    const updated = await prisma.manualPayment.update({
      where: { id },
      data: {
        proofUrl,
        proofNote: note,
      },
      select: { id: true, proofUrl: true, proofNote: true, status: true },
    })

    // TODO opsional: kirim email ke admin/finance kalau perlu notif realtime.
    // Sekarang admin cek dari panel /admin/finance.

    return jsonOk(updated)
  } catch (err) {
    console.error('[POST /api/payment/manual/:id/proof] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
