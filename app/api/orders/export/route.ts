// GET /api/orders/export?tab=all&from=...&to=...
// Generate CSV pesanan user untuk download. Filter sama dengan /api/orders.
//
// Schema CSV di-extend 2026-05-19: tambah invoice number, email, items (form
// produk), shipping breakdown, bukti transfer URL. User report sebelumnya
// data items + bukti tidak muncul di export, padahal admin butuh untuk
// rekonsiliasi + audit.
import type { Prisma } from '@prisma/client'

import { jsonError, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

const HEADERS = [
  'ID',
  'Invoice',
  'Tanggal',
  'Nama',
  'Email',
  'Nomor HP',
  'Alamat',
  'Provinsi',
  'Kota',
  'Kode Pos',
  'Items (produk × qty @ harga)',
  'Total',
  'Metode Bayar',
  'Status Bayar',
  'Status Pengiriman',
  'No. Resi',
  'Bukti Transfer (URL)',
  'Asal Flow',
  'Catatan Customer',
  'Catatan Admin',
]

// Escape sesuai RFC 4180 — wrap pakai " kalau ada koma/quote/newline,
// lalu escape " jadi "".
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

// Format items JSON array jadi 1 string ringkas yang masih readable di Excel.
// Pisah antar item pakai "; " (koma sudah di-escape oleh csvEscape kalau ada).
type OrderItem = {
  name?: string
  qty?: number
  price?: number
  variantName?: string | null
  productId?: string | null
}
function formatItems(items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) return ''
  return items
    .map((raw) => {
      const it = raw as OrderItem
      const name = it.name ?? '(tanpa nama)'
      const variant = it.variantName ? ` [${it.variantName}]` : ''
      const qty = it.qty ?? 1
      const price = typeof it.price === 'number'
        ? ` @Rp${it.price.toLocaleString('id-ID')}`
        : ''
      return `${name}${variant} × ${qty}${price}`
    })
    .join('; ')
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
        invoiceNumber: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        customerAddress: true,
        shippingProvinceName: true,
        shippingCityName: true,
        shippingPostalCode: true,
        shippingAddress: true,
        items: true,
        totalAmount: true,
        paymentMethod: true,
        paymentStatus: true,
        paymentProofUrl: true,
        deliveryStatus: true,
        trackingNumber: true,
        flowName: true,
        notes: true,
        notesAdmin: true,
        createdAt: true,
      },
    })

    // Bukti URL — kalau absolute (http/https) pakai langsung; kalau relative
    // (/uploads/...) prefix dgn host saat ini supaya bisa di-klik dari Excel
    // tanpa hardcode domain di kode. Fallback domain dari NEXT_PUBLIC_APP_URL
    // (production env) — kalau tidak set, ambil dari request URL.
    const reqUrl = new URL(req.url)
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
      `${reqUrl.protocol}//${reqUrl.host}`
    const absUrl = (u: string | null) => {
      if (!u) return ''
      if (/^https?:\/\//.test(u)) return u
      return baseUrl + (u.startsWith('/') ? u : `/${u}`)
    }

    const rows: string[] = [HEADERS.map(csvEscape).join(',')]
    for (const o of orders) {
      // Alamat full: prefer shipping*Name+postal, fallback customerAddress.
      const alamatFull =
        o.shippingAddress ||
        o.customerAddress ||
        ''
      rows.push(
        [
          o.id,
          o.invoiceNumber ?? '',
          o.createdAt.toISOString(),
          o.customerName,
          o.customerEmail ?? '',
          o.customerPhone,
          alamatFull,
          o.shippingProvinceName ?? '',
          o.shippingCityName ?? '',
          o.shippingPostalCode ?? '',
          formatItems(o.items),
          o.totalAmount?.toString() ?? '',
          o.paymentMethod,
          o.paymentStatus,
          o.deliveryStatus,
          o.trackingNumber ?? '',
          absUrl(o.paymentProofUrl),
          o.flowName ?? '',
          o.notes ?? '',
          o.notesAdmin ?? '',
        ]
          .map(csvEscape)
          .join(','),
      )
    }
    // BOM untuk Excel locale-aware membaca UTF-8 (Excel default ANSI tanpa BOM)
    const csv = '﻿' + rows.join('\r\n') + '\r\n'

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
