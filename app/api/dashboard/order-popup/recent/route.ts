// GET /api/dashboard/order-popup/recent — return order paling baru milik
// seller untuk dashboard popup. Client polling tiap ~30 detik. Tidak
// di-cache (perlu fresh data).
//
// Berbeda dengan /api/p/social-proof/[slug] (public, anonymize):
// - private endpoint, seller LOGIN.
// - return full customerName + city + status (tidak anonim — admin lihat data
//   sendiri).
// - filter: cuma order belakangan (< 1 jam) supaya popup tidak spam order lama
//   tiap kali seller buka dashboard.
//
// Client comparison: client simpan `lastSeenOrderId` di sessionStorage,
// hanya tampilkan order yang `id > lastSeen`.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

const RECENT_WINDOW_MIN = 60
const LIMIT = 10

export async function GET() {
  try {
    await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const session = await requireSession()

  try {
    const sinceDate = new Date(Date.now() - RECENT_WINDOW_MIN * 60 * 1000)

    const orders = await prisma.userOrder.findMany({
      where: {
        userId: session.user.id,
        createdAt: { gte: sinceDate },
        customerName: { not: '' },
      },
      select: {
        id: true,
        customerName: true,
        shippingCityName: true,
        paymentStatus: true,
        totalRp: true,
        paidAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: LIMIT,
    })

    return jsonOk({
      orders: orders.map((o) => ({
        id: o.id,
        name: o.customerName.trim() || 'Pembeli',
        city: (o.shippingCityName ?? '').trim(),
        status: o.paymentStatus,
        totalRp: o.totalRp,
        ts: (o.paidAt ?? o.createdAt).toISOString(),
      })),
    })
  } catch (err) {
    console.error('[GET /api/dashboard/order-popup/recent] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
