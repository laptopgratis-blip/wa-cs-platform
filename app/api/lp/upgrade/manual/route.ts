// POST /api/lp/upgrade/manual
// Body: { packageId: string }  — packageId mengacu LpUpgradePackage
//
// Buat ManualPayment(purpose=LP_UPGRADE) dengan kode unik. Frontend redirect
// ke /checkout/manual-lp/[id]. Logic generate kode unik sama dengan transfer
// manual token (cek tabrakan totalAmount per hari, retry 20×).
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

const bodySchema = z.object({ packageId: z.string().min(1) })

const MAX_RETRY = 20

function randomUniqueCode(): number {
  return Math.floor(100 + Math.random() * 900)
}

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

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError('Body tidak valid')

  try {
    const pkg = await prisma.lpUpgradePackage.findFirst({
      where: { id: parsed.data.packageId, isActive: true },
    })
    if (!pkg) return jsonError('Paket LP tidak ditemukan', 404)

    const activeBank = await prisma.bankAccount.findFirst({
      where: { isActive: true },
      select: { id: true },
    })
    if (!activeBank) {
      return jsonError('Belum ada rekening bank aktif. Hubungi admin.', 503)
    }

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
        // packageId kosong (TokenPackage); pakai lpPackageId.
        packageId: null,
        purpose: 'LP_UPGRADE',
        lpPackageId: pkg.id,
        amount: pkg.price,
        tokenAmount: 0,
        uniqueCode,
        totalAmount: pkg.price + uniqueCode,
        status: 'PENDING',
      },
      select: {
        id: true,
        uniqueCode: true,
        totalAmount: true,
        amount: true,
      },
    })

    return jsonOk(created, 201)
  } catch (err) {
    console.error('[POST /api/lp/upgrade/manual] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
