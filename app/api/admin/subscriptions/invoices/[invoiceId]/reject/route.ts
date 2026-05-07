// POST /api/admin/subscriptions/invoices/[invoiceId]/reject
// Body: { reason: string }
// Admin reject manual transfer (bukti tidak valid). Invoice → CANCELLED,
// subscription PENDING → CANCELLED.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireFinanceOrAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/services/subscription'

const bodySchema = z.object({
  reason: z.string().min(1).max(500),
})

interface Params {
  params: Promise<{ invoiceId: string }>
}

export async function POST(req: Request, { params }: Params) {
  let session
  try {
    session = await requireFinanceOrAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const { invoiceId } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }

  try {
    const invoice = await prisma.subscriptionInvoice.findUnique({
      where: { id: invoiceId },
      include: { subscription: true },
    })
    if (!invoice) return jsonError('Invoice tidak ditemukan', 404)

    await prisma.$transaction([
      prisma.subscriptionInvoice.update({
        where: { id: invoiceId },
        data: {
          status: 'CANCELLED',
          approvedBy: session.user.id,
          approvedAt: new Date(),
          manualNote: `REJECTED: ${parsed.data.reason}`,
        },
      }),
      prisma.subscription.update({
        where: { id: invoice.subscriptionId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledReason: `Manual proof rejected: ${parsed.data.reason}`,
        },
      }),
    ])

    await createNotification({
      userId: invoice.subscription.userId,
      subscriptionId: invoice.subscriptionId,
      type: 'PAYMENT_FAILED',
      channel: 'IN_APP',
      title: '❌ Bukti Transfer Ditolak',
      message: `Invoice ${invoice.invoiceNumber} ditolak admin: ${parsed.data.reason}. Silakan cek kembali bukti transfer atau hubungi admin.`,
      link: '/billing/subscription',
    }).catch(() => {})

    return jsonOk({ success: true })
  } catch (err) {
    console.error('[POST .../invoices/:id/reject] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
