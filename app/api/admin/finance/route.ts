// GET /api/admin/finance?status=PENDING|CONFIRMED|REJECTED|ALL
// List manual payments untuk panel verifikasi finance.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireFinanceOrAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'

const ALLOWED_STATUS = new Set(['PENDING', 'CONFIRMED', 'REJECTED', 'ALL'])

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
    // Halaman /admin/finance khusus pembelian token. LP upgrade ada
    // panel terpisah di /admin/lp-upgrades. Filter eksplisit supaya tidak
    // campur (row LP_UPGRADE punya package=null yang akan crash UI).
    const baseWhere = { purpose: 'TOKEN_PURCHASE' as const }
    const where =
      statusFilter === 'ALL'
        ? baseWhere
        : {
            ...baseWhere,
            status: statusFilter as 'PENDING' | 'CONFIRMED' | 'REJECTED',
          }

    const rows = await prisma.manualPayment.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      include: {
        user: { select: { id: true, name: true, email: true } },
        package: { select: { id: true, name: true } },
        confirmer: { select: { id: true, name: true, email: true } },
      },
    })

    return jsonOk(
      rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        confirmedAt: r.confirmedAt?.toISOString() ?? null,
      })),
    )
  } catch (err) {
    console.error('[GET /api/admin/finance] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
