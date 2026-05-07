// POST /api/cron/invoice-expire — hourly.
// Invoice PENDING yg expiresAt sudah lewat → status EXPIRED.
// Subscription PENDING yg invoice-nya expire → CANCELLED.
import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json(
      { success: false, error: 'unauthorized' },
      { status: 401 },
    )
  }

  const now = new Date()

  // Step 1: Update invoice PENDING expired → EXPIRED.
  // WAITING_CONFIRMATION TIDAK auto-expire — admin perlu approve/reject manual.
  const expiredInvoices = await prisma.subscriptionInvoice.updateMany({
    where: {
      status: 'PENDING',
      expiresAt: { lt: now },
    },
    data: { status: 'EXPIRED' },
  })

  // Step 2: Cari subscription PENDING yg semua invoice-nya sudah EXPIRED/CANCELLED.
  // Cancel subscription supaya tidak menggantung di list "pending payment".
  const candidates = await prisma.subscription.findMany({
    where: { status: 'PENDING' },
    include: {
      invoices: { select: { status: true } },
    },
  })
  let cancelledSubs = 0
  for (const sub of candidates) {
    const allDead = sub.invoices.every(
      (i) => i.status === 'EXPIRED' || i.status === 'CANCELLED',
    )
    if (sub.invoices.length > 0 && allDead) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledReason: 'All invoices expired',
        },
      })
      cancelledSubs++
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      expiredInvoices: expiredInvoices.count,
      cancelledSubscriptions: cancelledSubs,
    },
  })
}
