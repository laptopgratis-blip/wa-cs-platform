// POST or GET /api/cron/payment-reconcile
//
// Reconciliation untuk Payment Tripay yang stuck di PENDING karena webhook
// drop (network issue / infra Tripay sempat down). Untuk tiap PENDING dengan
// reference Tripay, kita poll Tripay's getTransactionDetail. Kalau status
// sudah final (PAID/EXPIRED/FAILED), proses sama seperti webhook — kredit
// token + upgrade tier (atomik) atau mark expired/failed.
//
// Pakai unique constraint TokenTransaction(userId, reference, type) untuk
// dedup kalau race dengan webhook yang akhirnya nyampai. P2002 di-treat
// sebagai already-processed (tidak error).
//
// Auth: header `x-cron-secret` atau query `?secret=` == CRON_SECRET. Sama
// dengan cron lain (lihat /api/cron/order-auto-cancel).
import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'

import { upgradeTierFromPurchase } from '@/lib/lp-quota'
import { prisma } from '@/lib/prisma'
import { getTransactionDetail } from '@/lib/tripay'

// Window 24 jam: lebih dari ini, anggap webhook benar-benar lost dan
// payment akan dieksekusi via expiredAt manual atau ditinggalkan.
const RECONCILE_WINDOW_MS = 24 * 60 * 60 * 1000
// Cap supaya satu run cron tidak terlalu lama kalau backlog besar.
const MAX_PER_RUN = 100

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const url = new URL(req.url)
  const queryToken = url.searchParams.get('secret')
  const headerToken = req.headers.get('x-cron-secret')
  return queryToken === expected || headerToken === expected
}

interface ReconcileSummary {
  checked: number
  paid: number
  expired: number
  failed: number
  unchanged: number
  errors: number
}

async function reconcileOne(payment: {
  id: string
  userId: string
  orderId: string
  reference: string | null
  status: string
  paymentMethod: string | null
  tokenAmount: number
  expiredAt: Date | null
}): Promise<'paid' | 'expired' | 'failed' | 'unchanged' | 'error'> {
  if (!payment.reference) return 'unchanged'

  let detail
  try {
    detail = await getTransactionDetail(payment.reference)
  } catch (err) {
    console.error(
      '[payment-reconcile] getTransactionDetail gagal:',
      payment.orderId,
      err,
    )
    return 'error'
  }

  let next: 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED' = 'PENDING'
  if (detail.status === 'PAID') next = 'SUCCESS'
  else if (detail.status === 'EXPIRED') next = 'EXPIRED'
  else if (detail.status === 'FAILED' || detail.status === 'REFUND')
    next = 'FAILED'
  else if (detail.status === 'UNPAID') next = 'PENDING'

  if (next === 'PENDING') return 'unchanged'

  try {
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: next,
          paidAt:
            next === 'SUCCESS'
              ? detail.paid_at
                ? new Date(detail.paid_at * 1000)
                : new Date()
              : null,
        },
      })
      if (next === 'SUCCESS') {
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
            description: `Pembelian via Tripay (reconcile, ${payment.paymentMethod ?? 'unknown'})`,
            reference: payment.orderId,
          },
        })
        await upgradeTierFromPurchase(payment.userId, payment.tokenAmount, tx)
      }
    })
  } catch (txErr) {
    if (
      txErr instanceof Prisma.PrismaClientKnownRequestError &&
      txErr.code === 'P2002'
    ) {
      // Webhook sudah credit duluan — already processed.
      return 'unchanged'
    }
    console.error(
      '[payment-reconcile] tx gagal:',
      payment.orderId,
      txErr,
    )
    return 'error'
  }

  return next === 'SUCCESS' ? 'paid' : next === 'EXPIRED' ? 'expired' : 'failed'
}

async function handle(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { success: false, error: 'unauthorized' },
      { status: 401 },
    )
  }

  const startedAt = Date.now()
  const cutoff = new Date(Date.now() - RECONCILE_WINDOW_MS)

  const candidates = await prisma.payment.findMany({
    where: {
      status: 'PENDING',
      reference: { not: null },
      createdAt: { gte: cutoff },
    },
    orderBy: { createdAt: 'asc' },
    take: MAX_PER_RUN,
    select: {
      id: true,
      userId: true,
      orderId: true,
      reference: true,
      status: true,
      paymentMethod: true,
      tokenAmount: true,
      expiredAt: true,
    },
  })

  const summary: ReconcileSummary = {
    checked: candidates.length,
    paid: 0,
    expired: 0,
    failed: 0,
    unchanged: 0,
    errors: 0,
  }

  for (const p of candidates) {
    const r = await reconcileOne(p)
    if (r === 'paid') summary.paid++
    else if (r === 'expired') summary.expired++
    else if (r === 'failed') summary.failed++
    else if (r === 'error') summary.errors++
    else summary.unchanged++
  }

  const durationMs = Date.now() - startedAt
  console.log(
    `[payment-reconcile] done in ${durationMs}ms`,
    JSON.stringify(summary),
  )

  return NextResponse.json({ success: true, data: { ...summary, durationMs } })
}

export async function GET(req: Request) {
  return handle(req)
}

export async function POST(req: Request) {
  return handle(req)
}
