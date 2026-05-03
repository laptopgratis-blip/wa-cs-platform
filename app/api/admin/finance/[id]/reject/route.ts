// POST /api/admin/finance/[id]/reject
// Body: { reason: string } — alasan penolakan (wajib).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireFinanceOrAdmin } from '@/lib/api'
import { sendManualPaymentRejectedEmail } from '@/lib/email'
import { prisma } from '@/lib/prisma'
import { manualPaymentRejectSchema } from '@/lib/validations/admin'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: Params) {
  let session
  try {
    session = await requireFinanceOrAdmin()
  } catch (res) {
    return res as NextResponse
  }

  const { id } = await params
  const parsed = manualPaymentRejectSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }

  try {
    const payment = await prisma.manualPayment.findUnique({
      where: { id },
      include: {
        user: { select: { email: true, name: true } },
        package: { select: { name: true } },
      },
    })
    if (!payment) return jsonError('Order tidak ditemukan', 404)
    // Endpoint ini khusus token. LP upgrade pakai /api/admin/lp-upgrades/:id/reject.
    if (payment.purpose !== 'TOKEN_PURCHASE' || !payment.package) {
      return jsonError(
        'Order ini bukan pembelian token. Gunakan menu Upgrade LP.',
        409,
      )
    }

    if (payment.status === 'CONFIRMED') {
      return jsonError('Order sudah dikonfirmasi, tidak bisa ditolak.', 409)
    }
    if (payment.status === 'REJECTED') {
      return jsonOk({ idempotent: true })
    }

    // Pull ke local supaya narrowing tidak hilang setelah await berikutnya.
    const pkg = payment.package

    await prisma.manualPayment.update({
      where: { id: payment.id },
      data: {
        status: 'REJECTED',
        rejectionReason: parsed.data.reason,
        confirmedBy: session.user.id,
        confirmedAt: new Date(),
      },
    })

    try {
      await sendManualPaymentRejectedEmail({
        userEmail: payment.user.email,
        userName: payment.user.name,
        packageName: pkg.name,
        tokenAmount: payment.tokenAmount,
        totalAmount: payment.totalAmount,
        reason: parsed.data.reason,
      })
    } catch (mailErr) {
      console.error(
        '[POST /api/admin/finance/:id/reject] gagal kirim email:',
        mailErr,
      )
    }

    return jsonOk({ rejected: true })
  } catch (err) {
    console.error('[POST /api/admin/finance/:id/reject] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
