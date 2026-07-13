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
//   statsRange : today|12h|24h|7d|custom — periode kartu statistik header
//   statsFrom, statsTo : ISO date — rentang custom untuk statsRange=custom
//
// Response: { orders, counts, nextCursor, totals }
//   counts = per tab (untuk badge angka)
//   totals = stats hari ini (orders count + revenue Rp)
import type { Prisma } from '@prisma/client'
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { buildOrderBaseWhere } from '@/lib/order-filters'
import { prisma } from '@/lib/prisma'
import type { OrderTab } from '@/lib/validations/order'

// "Urgent threshold" untuk filter `urgent` — order yang butuh action SEKARANG.
// 12 jam = ambang konservatif: customer rata-rata expect respon < 1 hari kerja.
const URGENT_HOURS = 12

// Batas "hari ini/kemarin" dihitung dalam WIB (UTC+7), BUKAN jam server.
// Server jalan di UTC — tanpa offset ini "hari ini" baru mulai 07:00 WIB,
// sehingga penjualan live malam (19:30–07:00 WIB) hilang dari strip revenue.
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
function startOfTodayWib(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + WIB_OFFSET_MS)
  shifted.setUTCHours(0, 0, 0, 0)
  return new Date(shifted.getTime() - WIB_OFFSET_MS)
}

// Periode strip statistik (kartu di atas /pesanan) — terpisah dari filter
// list. Preset relatif (12h/24h/7d) supaya sesi live malam yang melewati
// pergantian hari tetap terlihat utuh; custom = rentang tanggal bebas.
type StatsRange = 'today' | '12h' | '24h' | '7d' | 'custom'
function parseStatsRange(v: string | null): StatsRange {
  switch (v) {
    case '12h':
    case '24h':
    case '7d':
    case 'custom':
      return v
    default:
      return 'today'
  }
}
function resolveStatsWindow(
  range: StatsRange,
  fromIso: string | null,
  toIso: string | null,
): { start: Date; end: Date | null } {
  const now = new Date()
  switch (range) {
    case '12h':
      return { start: new Date(now.getTime() - 12 * 60 * 60 * 1000), end: null }
    case '24h':
      return { start: new Date(now.getTime() - DAY_MS), end: null }
    case '7d':
      return { start: new Date(now.getTime() - 7 * DAY_MS), end: null }
    case 'custom': {
      const from = fromIso ? new Date(fromIso) : null
      const to = toIso ? new Date(toIso) : null
      if (from && !Number.isNaN(from.getTime())) {
        return {
          start: from,
          end: to && !Number.isNaN(to.getTime()) ? to : null,
        }
      }
      // Custom tanpa tanggal valid → fallback hari ini.
      return { start: startOfTodayWib(now), end: null }
    }
    case 'today':
    default:
      return { start: startOfTodayWib(now), end: null }
  }
}

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
      return { createdAt: { gte: startOfTodayWib(now) } }
    }
    case 'yesterday': {
      const todayStart = startOfTodayWib(now)
      return {
        createdAt: {
          gte: new Date(todayStart.getTime() - DAY_MS),
          lt: todayStart,
        },
      }
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
  originSnapshot: true,
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
  const smart = parseSmart(url.searchParams.get('f'))
  const statsRange = parseStatsRange(url.searchParams.get('statsRange'))
  const statsFromRaw = url.searchParams.get('statsFrom')
  const statsToRaw = url.searchParams.get('statsTo')
  const cursor = url.searchParams.get('cursor')
  const limit = Math.min(
    Math.max(Number(url.searchParams.get('limit') ?? 50), 1),
    100,
  )
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
    // Base filter (q/tag/tanggal/pm/produk/gudang) — dibagi dengan /export via
    // lib/order-filters supaya isi CSV selalu sama dengan list.
    const baseWhere = buildOrderBaseWhere(url.searchParams, session.user.id)

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
        // Stats strip header — periode dipilih user (statsRange: hari ini WIB /
        // 12 jam / 24 jam / 7 hari / custom), independent dari filter list.
        //   todayCount/todayTotalRp : order masuk dalam periode (excl CANCELLED)
        //   todayUnpaidRp           : porsi yang BELUM dibayar (COD + transfer
        //                             PENDING/WAITING) — potensi revenue
        //   todayPaidRp             : dilunasi DALAM periode berbasis paidAt —
        //                             order lama yang dikonfirmasi ikut masuk
        (async () => {
          const { start, end } = resolveStatsWindow(
            statsRange,
            statsFromRaw,
            statsToRaw,
          )
          const createdRange: Prisma.DateTimeFilter = end
            ? { gte: start, lte: end }
            : { gte: start }
          const todayWhere: Prisma.UserOrderWhereInput = {
            userId: session.user.id,
            createdAt: createdRange,
            paymentStatus: { not: 'CANCELLED' },
          }
          const [todayCount, todayTotalAgg, todayUnpaidAgg, paidAgg, urgentCount] =
            await Promise.all([
              prisma.userOrder.count({ where: todayWhere }),
              prisma.userOrder.aggregate({
                where: todayWhere,
                _sum: { totalRp: true },
              }),
              prisma.userOrder.aggregate({
                where: {
                  ...todayWhere,
                  paymentStatus: { in: ['PENDING', 'WAITING_CONFIRMATION'] },
                },
                _sum: { totalRp: true },
              }),
              prisma.userOrder.aggregate({
                where: {
                  userId: session.user.id,
                  paymentStatus: 'PAID',
                  paidAt: createdRange,
                },
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
            todayTotalRp: todayTotalAgg._sum.totalRp ?? 0,
            todayUnpaidRp: todayUnpaidAgg._sum.totalRp ?? 0,
            todayPaidRp: paidAgg._sum.totalRp ?? 0,
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
