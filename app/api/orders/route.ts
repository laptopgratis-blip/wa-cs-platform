// GET /api/orders — list pesanan user dengan filter, cursor pagination, dan
// smart filter preset.
//
// Query params:
//   tab        : all|pending|paid|shipped|completed (default: all)
//   q          : search di customerName/customerPhone/notes/invoiceNumber
//                (case-insensitive)
//   from, to   : ISO date string — filter berdasarkan createdAt
//   pm         : cod|transfer — filter paymentMethod
//   f          : urgent|need_ship|need_tracking|today|yesterday|this_week
//                — preset smart filter (override tab kalau bertentangan)
//   limit      : max 100, default 50 (compact view fit lebih banyak)
//   cursor     : id order — ambil item setelah cursor (pagination)
//
// Response: { orders, counts, nextCursor, totals }
//   counts = per tab (untuk badge angka)
//   totals = stats hari ini (orders count + revenue Rp)
import type { Prisma } from '@prisma/client'
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import type { OrderTab } from '@/lib/validations/order'

// "Urgent threshold" untuk filter `urgent` — order yang butuh action SEKARANG.
// 12 jam = ambang konservatif: customer rata-rata expect respon < 1 hari kerja.
const URGENT_HOURS = 12

function buildTabFilter(tab: OrderTab): Prisma.UserOrderWhereInput {
  switch (tab) {
    case 'pending':
      return { paymentStatus: 'PENDING' }
    case 'paid':
      return {
        paymentStatus: 'PAID',
        deliveryStatus: { notIn: ['DELIVERED', 'CANCELLED'] },
      }
    case 'shipped':
      return { deliveryStatus: 'SHIPPED' }
    case 'completed':
      return { deliveryStatus: 'DELIVERED' }
    case 'all':
    default:
      return {}
  }
}

function parseTab(value: string | null): OrderTab {
  switch (value) {
    case 'pending':
    case 'paid':
    case 'shipped':
    case 'completed':
      return value
    default:
      return 'all'
  }
}

type SmartFilter =
  | 'urgent'
  | 'need_ship'
  | 'need_tracking'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'auto_confirmed'
  | 'unpaid_24h'

function parseSmart(v: string | null): SmartFilter | null {
  switch (v) {
    case 'urgent':
    case 'need_ship':
    case 'need_tracking':
    case 'today':
    case 'yesterday':
    case 'this_week':
    case 'auto_confirmed':
    case 'unpaid_24h':
      return v
    default:
      return null
  }
}

function buildSmartFilter(f: SmartFilter): Prisma.UserOrderWhereInput {
  const now = new Date()
  switch (f) {
    case 'urgent': {
      // PENDING atau WAITING_CONFIRMATION yang umurnya > URGENT_HOURS jam.
      const cutoff = new Date(now.getTime() - URGENT_HOURS * 60 * 60 * 1000)
      return {
        paymentStatus: { in: ['PENDING', 'WAITING_CONFIRMATION'] },
        createdAt: { lte: cutoff },
      }
    }
    case 'need_ship':
      return {
        paymentStatus: 'PAID',
        deliveryStatus: { in: ['PENDING', 'PROCESSING'] },
      }
    case 'need_tracking':
      return {
        deliveryStatus: 'SHIPPED',
        OR: [{ trackingNumber: null }, { trackingNumber: '' }],
      }
    case 'today': {
      const start = new Date(now)
      start.setHours(0, 0, 0, 0)
      return { createdAt: { gte: start } }
    }
    case 'yesterday': {
      const start = new Date(now)
      start.setDate(start.getDate() - 1)
      start.setHours(0, 0, 0, 0)
      const end = new Date(now)
      end.setDate(end.getDate() - 1)
      end.setHours(23, 59, 59, 999)
      return { createdAt: { gte: start, lte: end } }
    }
    case 'this_week': {
      const start = new Date(now)
      start.setDate(start.getDate() - 7)
      return { createdAt: { gte: start } }
    }
    case 'auto_confirmed':
      // Order yang status PAID-nya di-set otomatis oleh BCA Auto-Reader / Moota,
      // bukan manual. Untuk audit: cek mana yang machine-confirmed vs manual.
      return { autoConfirmedBy: { not: null } }
    case 'unpaid_24h': {
      const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      return {
        paymentStatus: { in: ['PENDING', 'WAITING_CONFIRMATION'] },
        createdAt: { lte: cutoff },
      }
    }
  }
}

const ORDER_SELECT = {
  id: true,
  customerName: true,
  customerPhone: true,
  customerEmail: true,
  customerAddress: true,
  items: true,
  totalAmount: true,
  paymentMethod: true,
  paymentStatus: true,
  deliveryStatus: true,
  trackingNumber: true,
  flowName: true,
  notes: true,
  notesAdmin: true,
  contactId: true,
  createdAt: true,
  updatedAt: true,
  invoiceNumber: true,
  paymentProofUrl: true,
  shippingAddress: true,
  shippingCourier: true,
  shippingService: true,
  shippingCityName: true,
  shippingProvinceName: true,
  subtotalRp: true,
  flashSaleDiscountRp: true,
  shippingCostRp: true,
  shippingSubsidyRp: true,
  appliedZoneName: true,
  totalRp: true,
  uniqueCode: true,
  paidAt: true,
  shippedAt: true,
  deliveredAt: true,
  autoConfirmedBy: true,
  autoConfirmedAt: true,
  utmSource: true,
  utmMedium: true,
  utmCampaign: true,
  fbclid: true,
  gclid: true,
  ttclid: true,
  pixelLeadFiredAt: true,
  pixelPurchaseFiredAt: true,
  orderForm: { select: { id: true, name: true, slug: true } },
  tags: { select: { id: true, name: true, color: true } },
} satisfies Prisma.UserOrderSelect

export async function GET(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const url = new URL(req.url)
  const tab = parseTab(url.searchParams.get('tab'))
  const q = (url.searchParams.get('q') ?? '').trim()
  const fromRaw = url.searchParams.get('from')
  const toRaw = url.searchParams.get('to')
  const pmRaw = url.searchParams.get('pm')?.toUpperCase()
  const smart = parseSmart(url.searchParams.get('f'))
  const cursor = url.searchParams.get('cursor')
  const limit = Math.min(
    Math.max(Number(url.searchParams.get('limit') ?? 50), 1),
    100,
  )
  // Optional tag filter — bisa multi via repeat param `?tag=ID&tag=ID` atau
  // CSV single param `?tag=ID,ID`. Filter additive ke smart/tab.
  const tagIdsRaw = url.searchParams.getAll('tag').flatMap((v) => v.split(','))
  const tagIds = tagIdsRaw.map((s) => s.trim()).filter(Boolean)
  // Optional sort: hanya kolom yang sortable di server. Default tetap
  // createdAt desc kalau tidak diisi.
  const sortRaw = url.searchParams.get('sort')
  const dirRaw = url.searchParams.get('dir')
  const SORTABLE_KEYS = new Set([
    'createdAt',
    'totalRp',
    'paidAt',
    'shippedAt',
    'deliveredAt',
  ])
  const sortKey =
    sortRaw && SORTABLE_KEYS.has(sortRaw) ? sortRaw : 'createdAt'
  const sortDir: 'asc' | 'desc' = dirRaw === 'asc' ? 'asc' : 'desc'

  try {
    const baseWhere: Prisma.UserOrderWhereInput = {
      userId: session.user.id,
    }
    if (q) {
      baseWhere.OR = [
        { customerName: { contains: q, mode: 'insensitive' } },
        { customerPhone: { contains: q, mode: 'insensitive' } },
        { customerEmail: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
        { notesAdmin: { contains: q, mode: 'insensitive' } },
        { invoiceNumber: { contains: q, mode: 'insensitive' } },
        { trackingNumber: { contains: q, mode: 'insensitive' } },
      ]
    }
    if (tagIds.length > 0) {
      // Match order yang punya MINIMAL satu dari tag yang dipilih (OR semantic).
      baseWhere.tags = { some: { id: { in: tagIds } } }
    }
    const dateRange: Prisma.DateTimeFilter = {}
    if (fromRaw) {
      const d = new Date(fromRaw)
      if (!Number.isNaN(d.getTime())) dateRange.gte = d
    }
    if (toRaw) {
      const d = new Date(toRaw)
      if (!Number.isNaN(d.getTime())) dateRange.lte = d
    }
    if (Object.keys(dateRange).length > 0) {
      baseWhere.createdAt = dateRange
    }
    if (pmRaw === 'COD' || pmRaw === 'TRANSFER') {
      baseWhere.paymentMethod = pmRaw
    }

    // Smart filter di-apply di atas baseWhere TAPI overrides tab kalau ada.
    // Reasoning: kalau user pilih chip "Urgent", expectation-nya lihat semua
    // urgent regardless of tab aktif. Tab di-treat sebagai default view.
    const tabFilter = smart ? buildSmartFilter(smart) : buildTabFilter(tab)

    const where: Prisma.UserOrderWhereInput = {
      ...baseWhere,
      ...tabFilter,
    }

    // Cursor pagination — ambil 1 lebih banyak dari limit untuk tahu apakah
    // ada page berikutnya, lalu trim.
    const [items, countAll, countPending, countPaid, countShipped, countCompleted, todayStats] =
      await Promise.all([
        prisma.userOrder.findMany({
          where,
          orderBy: { [sortKey]: sortDir },
          take: limit + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          select: ORDER_SELECT,
        }),
        prisma.userOrder.count({ where: baseWhere }),
        prisma.userOrder.count({
          where: { ...baseWhere, ...buildTabFilter('pending') },
        }),
        prisma.userOrder.count({
          where: { ...baseWhere, ...buildTabFilter('paid') },
        }),
        prisma.userOrder.count({
          where: { ...baseWhere, ...buildTabFilter('shipped') },
        }),
        prisma.userOrder.count({
          where: { ...baseWhere, ...buildTabFilter('completed') },
        }),
        // Stats hari ini — independent dari filter, untuk strip header.
        // Hitung count + sum totalRp orders yang createdAt >= start of today.
        (async () => {
          const startOfToday = new Date()
          startOfToday.setHours(0, 0, 0, 0)
          const todayWhere: Prisma.UserOrderWhereInput = {
            userId: session.user.id,
            createdAt: { gte: startOfToday },
          }
          const [todayCount, todayAgg, urgentCount] = await Promise.all([
            prisma.userOrder.count({ where: todayWhere }),
            prisma.userOrder.aggregate({
              where: { ...todayWhere, paymentStatus: 'PAID' },
              _sum: { totalRp: true },
            }),
            // Urgent count untuk badge chip — independent dari filter aktif.
            prisma.userOrder.count({
              where: {
                userId: session.user.id,
                ...buildSmartFilter('urgent'),
              },
            }),
          ])
          return {
            todayCount,
            todayPaidRp: todayAgg._sum.totalRp ?? 0,
            urgentCount,
          }
        })(),
      ])

    const hasNext = items.length > limit
    const orders = (hasNext ? items.slice(0, limit) : items).map((o) => ({
      ...o,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    }))
    const nextCursor = hasNext ? orders[orders.length - 1]?.id ?? null : null

    return jsonOk({
      orders,
      nextCursor,
      counts: {
        all: countAll,
        pending: countPending,
        paid: countPaid,
        shipped: countShipped,
        completed: countCompleted,
      },
      totals: todayStats,
    })
  } catch (err) {
    console.error('[GET /api/orders] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
