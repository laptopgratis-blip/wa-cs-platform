// GET /api/admin/lp-upgrades?status=PENDING|CONFIRMED|REJECTED|ALL
// List semua pembelian LP upgrade — manual + Tripay digabung dengan field
// `method` sebagai diskriminator. Tombol aksi (confirm/reject) hanya untuk
// manual + PENDING.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireFinanceOrAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'

const ALLOWED_STATUS = new Set(['PENDING', 'CONFIRMED', 'REJECTED', 'ALL'])

// Tripay status (PaymentStatus) ke ManualPaymentStatus untuk konsistensi UI.
function mapTripayStatus(s: 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED' | 'CANCELLED'):
  'PENDING' | 'CONFIRMED' | 'REJECTED' {
  if (s === 'SUCCESS') return 'CONFIRMED'
  if (s === 'PENDING') return 'PENDING'
  return 'REJECTED' // FAILED/EXPIRED/CANCELLED → REJECTED
}

export async function GET(req: Request) {
  try {
    await requireFinanceOrAdmin()
  } catch (res) {
    return res as NextResponse
  }

  const url = new URL(req.url)
  const statusFilter = (url.searchParams.get('status') ?? 'PENDING').toUpperCase()
  if (!ALLOWED_STATUS.has(statusFilter)) {
    return jsonError('Status filter tidak valid')
  }

  try {
    // Manual payments
    const manualWhere =
      statusFilter === 'ALL'
        ? { purpose: 'LP_UPGRADE' as const }
        : {
            purpose: 'LP_UPGRADE' as const,
            status: statusFilter as 'PENDING' | 'CONFIRMED' | 'REJECTED',
          }
    const manuals = await prisma.manualPayment.findMany({
      where: manualWhere,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: { select: { id: true, name: true, email: true } },
        lpPackage: true,
        confirmer: { select: { id: true, name: true, email: true } },
      },
    })

    // Tripay payments — map status PaymentStatus → ManualPaymentStatus untuk
    // filter konsisten.
    const allTripays = await prisma.payment.findMany({
      where: { purpose: 'LP_UPGRADE' },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        lpPackage: true,
      },
    })
    const tripaysFiltered =
      statusFilter === 'ALL'
        ? allTripays
        : allTripays.filter((p) => mapTripayStatus(p.status) === statusFilter)

    // Fetch user data untuk tripay payments separately (no relation defined).
    const userIds = Array.from(new Set(tripaysFiltered.map((p) => p.userId)))
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    })
    const userMap = new Map(users.map((u) => [u.id, u]))

    return jsonOk({
      manuals: manuals.map((m) => ({
        id: m.id,
        method: 'MANUAL' as const,
        status: m.status,
        amount: m.amount,
        totalAmount: m.totalAmount,
        uniqueCode: m.uniqueCode,
        proofUrl: m.proofUrl,
        proofNote: m.proofNote,
        rejectionReason: m.rejectionReason,
        createdAt: m.createdAt.toISOString(),
        confirmedAt: m.confirmedAt?.toISOString() ?? null,
        user: m.user,
        package: m.lpPackage
          ? {
              name: m.lpPackage.name,
              tier: m.lpPackage.tier,
              maxLp: m.lpPackage.maxLp,
              maxStorageMB: m.lpPackage.maxStorageMB,
            }
          : null,
        confirmer: m.confirmer,
      })),
      tripays: tripaysFiltered.map((p) => ({
        id: p.id,
        orderId: p.orderId,
        method: 'TRIPAY' as const,
        // Display sebagai ManualPaymentStatus supaya UI konsisten.
        status: mapTripayStatus(p.status),
        rawStatus: p.status,
        amount: p.amount,
        paymentMethod: p.paymentMethod,
        reference: p.reference,
        paymentUrl: p.paymentUrl,
        createdAt: p.createdAt.toISOString(),
        paidAt: p.paidAt?.toISOString() ?? null,
        user: userMap.get(p.userId) ?? null,
        package: p.lpPackage
          ? {
              name: p.lpPackage.name,
              tier: p.lpPackage.tier,
              maxLp: p.lpPackage.maxLp,
              maxStorageMB: p.lpPackage.maxStorageMB,
            }
          : null,
      })),
    })
  } catch (err) {
    console.error('[GET /api/admin/lp-upgrades] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
