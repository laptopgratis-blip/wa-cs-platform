// POST /api/payment/create
// Body: { packageId: string, method?: string }
// Buat Payment di DB (status PENDING) + minta checkout dari Tripay,
// simpan reference & paymentUrl, return orderId untuk frontend redirect
// ke /checkout/[orderId].
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { createTransaction } from '@/lib/tripay'

const bodySchema = z.object({
  packageId: z.string().min(1),
  method: z.string().min(1).optional(),
})

// Order ID format: WA-<timestamp>-<random>. Wajib unik dan max 50 char.
function makeOrderId(): string {
  const ts = Date.now().toString(36)
  const rnd = Math.random().toString(36).slice(2, 8)
  return `WA-${ts}-${rnd}`.toUpperCase()
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
    const pkg = await prisma.tokenPackage.findFirst({
      where: { id: parsed.data.packageId, isActive: true },
    })
    if (!pkg) return jsonError('Paket tidak ditemukan', 404)

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, name: true },
    })
    if (!user) return jsonError('User tidak ditemukan', 404)

    const orderId = makeOrderId()
    const expiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 jam

    // Buat row Payment dulu — kalau Tripay gagal, status berubah jadi FAILED
    // dan order ID-nya unik (constraint) jadi aman untuk retry.
    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        orderId,
        amount: pkg.price,
        tokenAmount: pkg.tokenAmount,
        status: 'PENDING',
        expiredAt,
      },
    })

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000'

    try {
      const tx = await createTransaction({
        orderId,
        amount: pkg.price,
        tokenAmount: pkg.tokenAmount,
        customerName: user.name ?? 'Customer',
        customerEmail: user.email,
        method: parsed.data.method,
        callbackUrl: `${baseUrl}/api/payment/tripay-webhook`,
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
          // Tripay tambah fee_customer di atas pkg.price; VA statis BCA dll
          // tolak kalau customer transfer kurang. Simpan total customer
          // supaya halaman checkout tampilin angka yang sama dgn yang
          // ditagih bank/merchant.
          amount: tx.customerAmount,
        },
      })

      return jsonOk(
        {
          orderId,
          reference: tx.reference,
          paymentUrl: tx.paymentUrl,
          payCode: tx.payCode,
          paymentName: tx.paymentName,
          amount: pkg.price,
          tokenAmount: pkg.tokenAmount,
          packageName: pkg.name,
        },
        201,
      )
    } catch (err) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      })
      console.error('[POST /api/payment/create] Tripay error:', err)
      return jsonError('Gagal menghubungi Tripay', 502)
    }
  } catch (err) {
    console.error('[POST /api/payment/create] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
