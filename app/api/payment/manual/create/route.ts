// POST /api/payment/manual/create
// Body: { packageId: string }
//
// Buat ManualPayment dengan kode unik 100-999 yang belum dipakai user lain
// untuk paket yang sama hari itu (kombinasi totalAmount harus unik per hari).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { manualPaymentCreateSchema } from '@/lib/validations/payment'

const MAX_RETRY = 20

// Generate kode unik random 100-999.
function randomUniqueCode(): number {
  return Math.floor(100 + Math.random() * 900)
}

// Cek apakah kombinasi (price + uniqueCode) di hari ini masih unik.
// Penting supaya admin tidak bingung mencocokkan dua transfer dengan nominal sama.
async function isCodeAvailableToday(price: number, code: number): Promise<boolean> {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const exists = await prisma.manualPayment.findFirst({
    where: {
      totalAmount: price + code,
      createdAt: { gte: startOfDay },
      status: { in: ['PENDING', 'CONFIRMED'] },
    },
    select: { id: true },
  })
  return !exists
}

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const parsed = manualPaymentCreateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }

  try {
    const pkg = await prisma.tokenPackage.findFirst({
      where: { id: parsed.data.packageId, isActive: true },
    })
    if (!pkg) return jsonError('Paket tidak ditemukan', 404)

    // Pastikan ada minimal satu rekening aktif — kalau tidak ada, user akan
    // kebingungan di halaman checkout.
    const activeBank = await prisma.bankAccount.findFirst({
      where: { isActive: true },
      select: { id: true },
    })
    if (!activeBank) {
      return jsonError(
        'Belum ada rekening bank aktif. Hubungi admin.',
        503,
      )
    }

    // Cari kode unik yang belum dipakai hari ini. Retry beberapa kali —
    // praktisnya tabrakan sangat jarang karena range 100-999.
    let uniqueCode = 0
    for (let i = 0; i < MAX_RETRY; i++) {
      const candidate = randomUniqueCode()
      if (await isCodeAvailableToday(pkg.price, candidate)) {
        uniqueCode = candidate
        break
      }
    }
    if (uniqueCode === 0) {
      return jsonError(
        'Gagal mendapatkan kode unik, coba lagi beberapa saat.',
        503,
      )
    }

    const created = await prisma.manualPayment.create({
      data: {
        userId: session.user.id,
        packageId: pkg.id,
        amount: pkg.price,
        tokenAmount: pkg.tokenAmount,
        uniqueCode,
        totalAmount: pkg.price + uniqueCode,
        status: 'PENDING',
      },
      select: {
        id: true,
        uniqueCode: true,
        totalAmount: true,
        amount: true,
        tokenAmount: true,
      },
    })

    return jsonOk(created, 201)
  } catch (err) {
    console.error('[POST /api/payment/manual/create] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
