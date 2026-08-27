// POST /api/admin/finance/[id]/confirm
// Konfirmasi manual payment: tambah saldo token + buat TokenTransaction.
// Idempotent: skip kalau sudah CONFIRMED.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireFinanceOrAdmin } from '@/lib/api'
import { sendManualPaymentConfirmedEmail } from '@/lib/email'
import { prisma } from '@/lib/prisma'
import { applyPaymentCredit, unitLabelForPurpose } from '@/lib/billing/apply-payment-credit'

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
    // Endpoint ini khusus paket token / kredit pesan. LP upgrade pakai
    // /api/admin/lp-upgrades/:id/confirm.
    if (
      (payment.purpose !== 'TOKEN_PURCHASE' && payment.purpose !== 'MESSAGE_CREDIT_PURCHASE') ||
      !payment.package
    ) {
      return jsonError(
        'Order ini bukan pembelian token. Gunakan menu Upgrade LP.',
        409,
      )
    }

    if (payment.status === 'CONFIRMED') {
      return jsonOk({ idempotent: true })
    }
    if (payment.status === 'REJECTED') {
      return jsonError('Order sudah ditolak, tidak bisa dikonfirmasi.', 409)
    }

    // Pull ke local supaya narrowing tetap valid di dalam async transaction.
    const pkg = payment.package
    await prisma.$transaction(async (tx) => {
      await tx.manualPayment.update({
        where: { id: payment.id },
        data: {
          status: 'CONFIRMED',
          confirmedBy: session.user.id,
          confirmedAt: new Date(),
        },
      })

      await applyPaymentCredit(tx, {
        userId: payment.userId,
        purpose: payment.purpose,
        amount: payment.tokenAmount,
        reference: payment.id,
        description: `Transfer manual — ${pkg.name}`,
      })
    })

    // Catatan 2026-07-14: top-up token TIDAK lagi menaikkan tier kuota LP —
    // tier murni dari subscription (lib/services/subscription.ts).

    // Kirim email notifikasi — failure email tidak boleh fail-kan transaksi.
    try {
      await sendManualPaymentConfirmedEmail({
        userEmail: payment.user.email,
        userName: payment.user.name,
        packageName: pkg.name,
        tokenAmount: payment.tokenAmount,
        totalAmount: payment.totalAmount,
        unitLabel: unitLabelForPurpose(payment.purpose),
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
