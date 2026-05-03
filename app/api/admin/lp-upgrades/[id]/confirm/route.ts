// POST /api/admin/lp-upgrades/[id]/confirm
// Konfirmasi ManualPayment(LP_UPGRADE) → apply quota upgrade.
// Idempotent: skip kalau sudah CONFIRMED.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireFinanceOrAdmin } from '@/lib/api'
import { applyLpUpgradeFromPackage } from '@/lib/lp-quota'
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
      include: { lpPackage: true, user: { select: { id: true } } },
    })
    if (!payment) return jsonError('Order tidak ditemukan', 404)
    if (payment.purpose !== 'LP_UPGRADE') {
      return jsonError('Order ini bukan upgrade LP', 409)
    }
    if (!payment.lpPackage) return jsonError('Paket LP tidak ditemukan', 404)
    if (payment.status === 'CONFIRMED') {
      return jsonOk({ idempotent: true })
    }
    if (payment.status === 'REJECTED') {
      return jsonError('Order sudah ditolak, tidak bisa dikonfirmasi.', 409)
    }

    // Pull ke local supaya narrowing tetap valid setelah await berikutnya.
    const lpPkg = payment.lpPackage

    await prisma.$transaction([
      prisma.manualPayment.update({
        where: { id: payment.id },
        data: {
          status: 'CONFIRMED',
          confirmedBy: session.user.id,
          confirmedAt: new Date(),
        },
      }),
    ])

    // Apply quota upgrade — di luar transaksi karena failure di sini tidak
    // boleh fail-kan konfirmasi (admin sudah verifikasi transfer; quota
    // upgrade bisa dikoreksi manual via DB kalau perlu).
    try {
      await applyLpUpgradeFromPackage(payment.userId, {
        tier: lpPkg.tier,
        maxLp: lpPkg.maxLp,
        maxStorageMB: lpPkg.maxStorageMB,
      })
    } catch (quotaErr) {
      console.error(
        '[POST /api/admin/lp-upgrades/:id/confirm] gagal apply quota:',
        quotaErr,
      )
    }

    return jsonOk({ confirmed: true })
  } catch (err) {
    console.error('[POST /api/admin/lp-upgrades/:id/confirm] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
