// GET /api/orders/export?tab=all&from=...&to=...
// Generate CSV pesanan user untuk download. Filter sama dengan /api/orders.
import type { Prisma } from '@prisma/client'

import { jsonError, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

const HEADERS = [
  'ID',
  'Tanggal',
  'Nama',
  'Nomor HP',
  'Alamat',
  'Total',
  'Metode Bayar',
  'Status Bayar',
  'Status Pengiriman',
  'No. Resi',
  'Asal Flow',
  'Catatan',
]

// Escape sesuai RFC 4180 — wrap pakai " kalau ada koma/quote/newline,
// lalu escape " jadi "".
function csvEscape(value: string): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as Response
  }

  const url = new URL(req.url)
  const tab = url.searchParams.get('tab')
  const fromRaw = url.searchParams.get('from')
  const toRaw = url.searchParams.get('to')

  try {
    const where: Prisma.UserOrderWhereInput = { userId: session.user.id }
    if (tab === 'pending') where.paymentStatus = 'PENDING'
    if (tab === 'paid') {
      where.paymentStatus = 'PAID'
      where.deliveryStatus = { notIn: ['DELIVERED', 'CANCELLED'] }
    }
    if (tab === 'shipped') where.deliveryStatus = 'SHIPPED'
    if (tab === 'completed') where.deliveryStatus = 'DELIVERED'

    const dateRange: Prisma.DateTimeFilter = {}
    if (fromRaw) {
      const d = new Date(fromRaw)
      if (!Number.isNaN(d.getTime())) dateRange.gte = d
    }
    if (toRaw) {
      const d = new Date(toRaw)
      if (!Number.isNaN(d.getTime())) dateRange.lte = d
    }
    if (Object.keys(dateRange).length > 0) where.createdAt = dateRange

    const orders = await prisma.userOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000, // safety cap
      select: {
        id: true,
        customerName: true,
        customerPhone: true,
        customerAddress: true,
        totalAmount: true,
        paymentMethod: true,
        paymentStatus: true,
        deliveryStatus: true,
        trackingNumber: true,
        flowName: true,
        notes: true,
        createdAt: true,
      },
    })

    const rows: string[] = [HEADERS.map(csvEscape).join(',')]
    for (const o of orders) {
      rows.push(
        [
          o.id,
          o.createdAt.toISOString(),
          o.customerName,
          o.customerPhone,
          o.customerAddress ?? '',
          o.totalAmount?.toString() ?? '',
          o.paymentMethod,
          o.paymentStatus,
          o.deliveryStatus,
          o.trackingNumber ?? '',
          o.flowName ?? '',
          o.notes ?? '',
        ]
          .map(csvEscape)
          .join(','),
      )
    }
    const csv = rows.join('\r\n') + '\r\n'

    const today = new Date().toISOString().slice(0, 10)
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="pesanan-${today}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[GET /api/orders/export] gagal:', err)
    return jsonError('Gagal export CSV', 500)
  }
}
