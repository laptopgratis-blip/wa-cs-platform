// POST /api/admin/lp-upgrades/[id]/reject
// Body: { reason: string }
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireFinanceOrAdmin } from '@/lib/api'
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
      select: { id: true, status: true, purpose: true },
    })
    if (!payment) return jsonError('Order tidak ditemukan', 404)
    if (payment.purpose !== 'LP_UPGRADE') {
      return jsonError('Order ini bukan upgrade LP', 409)
    }
    if (payment.status === 'CONFIRMED') {
      return jsonError('Order sudah dikonfirmasi.', 409)
    }
    if (payment.status === 'REJECTED') {
      return jsonOk({ idempotent: true })
    }

    await prisma.manualPayment.update({
      where: { id: payment.id },
      data: {
        status: 'REJECTED',
        rejectionReason: parsed.data.reason,
        confirmedBy: session.user.id,
        confirmedAt: new Date(),
      },
    })

    return jsonOk({ rejected: true })
  } catch (err) {
    console.error('[POST /api/admin/lp-upgrades/:id/reject] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
