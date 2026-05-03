// POST /api/admin/finance/[id]/confirm
// Konfirmasi manual payment: tambah saldo token + buat TokenTransaction.
// Idempotent: skip kalau sudah CONFIRMED.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireFinanceOrAdmin } from '@/lib/api'
import { sendManualPaymentConfirmedEmail } from '@/lib/email'
import { upgradeTierFromPurchase } from '@/lib/lp-quota'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireFinanceOrAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params

  try {
    const payment = await prisma.manualPayment.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, name: true } },
        package: { select: { name: true } },
      },
    })
    if (!payment) return jsonError('Order tidak ditemukan', 404)

    if (payment.status === 'CONFIRMED') {
      return jsonOk({ idempotent: true })
    }
    if (payment.status === 'REJECTED') {
      return jsonError('Order sudah ditolak, tidak bisa dikonfirmasi.', 409)
    }
    if (!payment.proofUrl) {
      return jsonError('User belum mengupload bukti transfer.', 409)
    }

    await prisma.$transaction(async (tx) => {
      await tx.manualPayment.update({
        where: { id: payment.id },
        data: {
          status: 'CONFIRMED',
          confirmedBy: session.user.id,
          confirmedAt: new Date(),
        },
      })

      await tx.tokenBalance.upsert({
        where: { userId: payment.userId },
        create: {
          userId: payment.userId,
          balance: payment.tokenAmount,
          totalPurchased: payment.tokenAmount,
        },
        update: {
          balance: { increment: payment.tokenAmount },
          totalPurchased: { increment: payment.tokenAmount },
        },
      })

      await tx.tokenTransaction.create({
        data: {
          userId: payment.userId,
          amount: payment.tokenAmount,
          type: 'PURCHASE',
          description: `Transfer manual — ${payment.package.name}`,
          reference: payment.id,
        },
      })
    })

    // Upgrade tier kuota LP. Di luar transaksi DB & dibungkus try/catch karena
    // failure di sini tidak boleh batalkan kredit token yang sudah berhasil.
    try {
      await upgradeTierFromPurchase(payment.userId, payment.tokenAmount)
    } catch (quotaErr) {
      console.error(
        '[POST /api/admin/finance/:id/confirm] gagal upgrade tier:',
        quotaErr,
      )
    }

    // Kirim email notifikasi — failure email tidak boleh fail-kan transaksi.
    try {
      await sendManualPaymentConfirmedEmail({
        userEmail: payment.user.email,
        userName: payment.user.name,
        packageName: payment.package.name,
        tokenAmount: payment.tokenAmount,
        totalAmount: payment.totalAmount,
      })
    } catch (mailErr) {
      console.error(
        '[POST /api/admin/finance/:id/confirm] gagal kirim email:',
        mailErr,
      )
    }

    return jsonOk({ confirmed: true })
  } catch (err) {
    console.error('[POST /api/admin/finance/:id/confirm] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
