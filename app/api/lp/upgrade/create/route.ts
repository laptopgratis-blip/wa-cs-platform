// POST /api/lp/upgrade/create
// Body: { packageId: string }  — packageId mengacu LpUpgradePackage
//
// Buat Payment(purpose=LP_UPGRADE) di DB, panggil Tripay createTransaction,
// simpan reference & paymentUrl. Frontend redirect ke /checkout/[orderId].
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { createTransaction } from '@/lib/tripay'

const bodySchema = z.object({ packageId: z.string().min(1) })

function makeOrderId(): string {
  const ts = Date.now().toString(36)
  const rnd = Math.random().toString(36).slice(2, 8)
  return `LP-${ts}-${rnd}`.toUpperCase()
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

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, name: true },
    })
    if (!user) return jsonError('User tidak ditemukan', 404)

    const orderId = makeOrderId()
    const expiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        orderId,
        amount: pkg.price,
        // tokenAmount=0 untuk LP_UPGRADE (field ini hanya relevan untuk TOKEN_PURCHASE).
        tokenAmount: 0,
        status: 'PENDING',
        purpose: 'LP_UPGRADE',
        lpPackageId: pkg.id,
        expiredAt,
      },
    })

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000'

    try {
      const tx = await createTransaction({
        orderId,
        amount: pkg.price,
        // tokenAmount kita kasih 0 — Tripay tidak peduli, ini cuma metadata
        // di item description.
        tokenAmount: 0,
        customerName: user.name ?? 'Customer',
        customerEmail: user.email,
        callbackUrl: `${baseUrl}/api/lp/upgrade/webhook`,
        returnUrl: `${baseUrl}/checkout/${orderId}`,
      })

      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          reference: tx.reference,
          paymentUrl: tx.paymentUrl,
          paymentMethod: tx.paymentMethod,
          paymentName: tx.paymentName,
          payCode: tx.payCode,
          expiredAt: tx.expiredAt,
          // Sama spt /api/payment/create: overwrite amount jadi total customer
          // (sudah include fee_customer Tripay) supaya UI /checkout cocok dgn
          // tagihan VA / kode bayar.
          amount: tx.customerAmount,
        },
      })

      return jsonOk(
        {
          orderId,
          reference: tx.reference,
          paymentUrl: tx.paymentUrl,
          amount: pkg.price,
          packageName: pkg.name,
        },
        201,
      )
    } catch (err) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      })
      console.error('[POST /api/lp/upgrade/create] Tripay error:', err)
      return jsonError('Gagal menghubungi Tripay', 502)
    }
  } catch (err) {
    console.error('[POST /api/lp/upgrade/create] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
