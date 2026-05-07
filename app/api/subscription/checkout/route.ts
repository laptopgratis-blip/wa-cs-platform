// POST /api/subscription/checkout
// Body: { lpPackageId, durationMonths, paymentMethod: 'TRIPAY' | 'MANUAL_TRANSFER',
//         tripayChannel?: string }
//
// Flow:
// 1. Validate session + body via zod.
// 2. Cek package valid + priceMonthly > 0 (FREE tidak bisa checkout).
// 3. Hitung harga pakai calculateSubscriptionPrice (durasi diskon).
// 4. Buat Subscription PENDING + SubscriptionInvoice PENDING.
// 5. Kalau TRIPAY: panggil tripay.createTransaction → simpan reference + paymentUrl.
//    Kalau MANUAL_TRANSFER: tambah uniqueCode ke amount → return instruksi rekening.
// 6. Return invoice info + payment URL/instructions.
//
// Logic extend (kalau user punya subscription ACTIVE same-package): startDate
// di-tunda sampai endDate existing (lihat activateSubscription di service).
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import {
  VALID_DURATIONS,
  calculateSubscriptionPrice,
  generateInvoiceNumber,
  generateUniqueCode,
} from '@/lib/subscription-pricing'
import { createTransaction } from '@/lib/tripay'

const bodySchema = z.object({
  lpPackageId: z.string().min(1),
  durationMonths: z.number().int().refine((n) => VALID_DURATIONS.includes(n), {
    message: `Durasi harus salah satu: ${VALID_DURATIONS.join(', ')}`,
  }),
  paymentMethod: z.enum(['TRIPAY', 'MANUAL_TRANSFER']),
  tripayChannel: z.string().optional(),
})

const INVOICE_EXPIRES_HOURS = 24

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  const { lpPackageId, durationMonths, paymentMethod, tripayChannel } =
    parsed.data

  if (paymentMethod === 'TRIPAY' && !tripayChannel) {
    return jsonError('tripayChannel wajib diisi untuk pembayaran online')
  }

  try {
    // 1. Validate package
    const pkg = await prisma.lpUpgradePackage.findUnique({
      where: { id: lpPackageId },
    })
    if (!pkg || !pkg.isActive) {
      return jsonError('Paket tidak ditemukan atau tidak aktif', 404)
    }
    if (pkg.priceMonthly <= 0) {
      return jsonError(
        'Paket ini belum bisa di-subscribe (harga belum disetel admin).',
      )
    }

    // 2. Hitung harga
    const calc = calculateSubscriptionPrice(pkg.priceMonthly, durationMonths)
    const uniqueCode =
      paymentMethod === 'MANUAL_TRANSFER' ? generateUniqueCode() : 0
    const finalAmount = calc.priceFinal + uniqueCode

    // 3. Get user untuk customer_email Tripay
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, name: true },
    })
    if (!user) return jsonError('User tidak ditemukan', 404)

    // 4. Buat Subscription + Invoice dlm transaction.
    const expiresAt = new Date(
      Date.now() + INVOICE_EXPIRES_HOURS * 60 * 60 * 1000,
    )
    const invoiceNumber = generateInvoiceNumber()

    const sub = await prisma.subscription.create({
      data: {
        userId: session.user.id,
        lpPackageId: pkg.id,
        durationMonths,
        // startDate/endDate diisi placeholder — di-update saat activate.
        startDate: new Date(),
        endDate: new Date(),
        status: 'PENDING',
        priceBase: calc.priceBase,
        discountPct: calc.discountPct,
        priceFinal: calc.priceFinal,
      },
    })

    // 5. Buat invoice — flow beda untuk Tripay vs Manual Transfer.
    if (paymentMethod === 'TRIPAY') {
      let tripay
      try {
        tripay = await createTransaction({
          orderId: invoiceNumber,
          amount: calc.priceFinal,
          itemName: `Subscription ${pkg.name} (${durationMonths} bulan)`,
          itemSku: 'SUB-LP',
          customerName: user.name || 'Customer',
          customerEmail: user.email,
          method: tripayChannel,
          expiresInSeconds: INVOICE_EXPIRES_HOURS * 60 * 60,
          callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://hulao.id'}/api/subscription/tripay/callback`,
          returnUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://hulao.id'}/billing/subscription`,
        })
      } catch (err) {
        // Rollback subscription kalau Tripay gagal — jangan tinggalkan
        // PENDING orphan tanpa invoice.
        await prisma.subscription
          .delete({ where: { id: sub.id } })
          .catch(() => {})
        return jsonError(
          `Gagal create transaksi Tripay: ${(err as Error).message}`,
          502,
        )
      }

      const invoice = await prisma.subscriptionInvoice.create({
        data: {
          subscriptionId: sub.id,
          invoiceNumber,
          amount: calc.priceFinal,
          uniqueCode: 0,
          description: `Subscription ${pkg.name} (${durationMonths} bulan)`,
          status: 'PENDING',
          paymentMethod: 'TRIPAY',
          tripayReference: tripay.reference,
          tripayMerchantRef: invoiceNumber,
          paymentUrl: tripay.paymentUrl,
          paymentChannel: tripayChannel,
          expiresAt,
        },
      })

      return jsonOk({
        subscriptionId: sub.id,
        invoiceId: invoice.id,
        invoiceNumber,
        paymentMethod: 'TRIPAY',
        paymentUrl: tripay.paymentUrl,
        payCode: tripay.payCode,
        paymentName: tripay.paymentName,
        amount: calc.priceFinal,
        expiresAt: expiresAt.toISOString(),
      })
    }

    // MANUAL_TRANSFER
    const invoice = await prisma.subscriptionInvoice.create({
      data: {
        subscriptionId: sub.id,
        invoiceNumber,
        amount: finalAmount,
        uniqueCode,
        description: `Subscription ${pkg.name} (${durationMonths} bulan)`,
        status: 'PENDING',
        paymentMethod: 'MANUAL_TRANSFER',
        expiresAt,
      },
    })

    // Ambil bank account aktif untuk instruksi.
    const bank = await prisma.bankAccount.findFirst({
      where: { isActive: true },
    })

    return jsonOk({
      subscriptionId: sub.id,
      invoiceId: invoice.id,
      invoiceNumber,
      paymentMethod: 'MANUAL_TRANSFER',
      amount: finalAmount,
      uniqueCode,
      priceBase: calc.priceBase,
      priceFinal: calc.priceFinal,
      bank: bank
        ? {
            bankName: bank.bankName,
            accountNumber: bank.accountNumber,
            accountName: bank.accountName,
          }
        : null,
      expiresAt: expiresAt.toISOString(),
      instructions: bank
        ? `Transfer Rp ${finalAmount.toLocaleString('id-ID')} (PERSIS dengan ${uniqueCode} di akhir) ke ${bank.bankName} ${bank.accountNumber} a/n ${bank.accountName}, lalu upload bukti transfer.`
        : 'Belum ada rekening bank aktif. Hubungi admin untuk konfirmasi.',
    })
  } catch (err) {
    console.error('[POST /api/subscription/checkout] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
