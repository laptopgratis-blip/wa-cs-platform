// POST /api/admin/subscriptions/invoices/[invoiceId]/approve
// Body: { note?: string }
// Admin approve manual transfer invoice → status PAID + activate subscription.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireFinanceOrAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { activateSubscription } from '@/lib/services/subscription'

const bodySchema = z.object({
  note: z.string().max(500).optional(),
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
    })
    if (!invoice) return jsonError('Invoice tidak ditemukan', 404)
    if (invoice.paymentMethod !== 'MANUAL_TRANSFER') {
      return jsonError('Hanya bisa approve invoice transfer manual')
    }
    if (invoice.status === 'PAID') {
      return jsonOk({ alreadyPaid: true, invoiceId })
    }
    if (
      invoice.status !== 'WAITING_CONFIRMATION' &&
      invoice.status !== 'PENDING'
    ) {
      return jsonError(
        `Invoice status ${invoice.status} tidak bisa di-approve`,
      )
    }

    await prisma.subscriptionInvoice.update({
      where: { id: invoiceId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        approvedBy: session.user.id,
        approvedAt: new Date(),
        manualNote: parsed.data.note ?? invoice.manualNote,
      },
    })

    await activateSubscription(invoice.subscriptionId)
    return jsonOk({ success: true })
  } catch (err) {
    console.error('[POST .../invoices/:id/approve] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
