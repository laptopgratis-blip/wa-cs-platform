import type { Prisma } from '@prisma/client'

import type { OrderTab } from '@/lib/validations/order'

// Filter pesanan — SATU sumber kebenaran dipakai bersama oleh GET /api/orders
// (list + counts) dan GET /api/orders/export (CSV) supaya isi export SELALU
// sama dengan yang tampil di list. Sebelumnya tiap route bangun filter
// sendiri-sendiri → melenceng (mis. filter per gudang / smart tak terpakai di
// export).

// "Urgent threshold" untuk filter `urgent` — order yang butuh action SEKARANG.
// 12 jam = ambang konservatif: customer rata-rata expect respon < 1 hari kerja.
const URGENT_HOURS = 12

// Batas "hari ini/kemarin" dihitung dalam WIB (UTC+7), BUKAN jam server. Server
// jalan di UTC — tanpa offset ini "hari ini" baru mulai 07:00 WIB, sehingga
// penjualan live malam (19:30–07:00 WIB) hilang. Di-export juga karena
// resolveStatsWindow (stats strip) di route memakainya.
export const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
export const DAY_MS = 24 * 60 * 60 * 1000
export function startOfTodayWib(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + WIB_OFFSET_MS)
  shifted.setUTCHours(0, 0, 0, 0)
  return new Date(shifted.getTime() - WIB_OFFSET_MS)
}

// ── BASE: field-level (q/tag/tanggal/pm/produk/gudang) ───────────────────────
// Cakupan: q (search), tag, rentang tanggal (from/to), metode bayar (pm),
// produk (productId), gudang (warehouseId). Tab & smart di luar ini.
export function buildOrderBaseWhere(
  sp: URLSearchParams,
  userId: string,
): Prisma.UserOrderWhereInput {
  const where: Prisma.UserOrderWhereInput = { userId }

  const q = (sp.get('q') ?? '').trim()
  if (q) {
    where.OR = [
      { customerName: { contains: q, mode: 'insensitive' } },
      { customerPhone: { contains: q, mode: 'insensitive' } },
      { customerEmail: { contains: q, mode: 'insensitive' } },
      { notes: { contains: q, mode: 'insensitive' } },
      { notesAdmin: { contains: q, mode: 'insensitive' } },
      { invoiceNumber: { contains: q, mode: 'insensitive' } },
      { trackingNumber: { contains: q, mode: 'insensitive' } },
    ]
  }

  const tagIds = sp
    .getAll('tag')
    .flatMap((v) => v.split(','))
    .map((s) => s.trim())
    .filter(Boolean)
  if (tagIds.length > 0) {
    where.tags = { some: { id: { in: tagIds } } }
  }

  const dateRange: Prisma.DateTimeFilter = {}
  const fromRaw = sp.get('from')
  const toRaw = sp.get('to')
  if (fromRaw) {
    const d = new Date(fromRaw)
    if (!Number.isNaN(d.getTime())) dateRange.gte = d
  }
  if (toRaw) {
    const d = new Date(toRaw)
    if (!Number.isNaN(d.getTime())) dateRange.lte = d
  }
  if (Object.keys(dateRange).length > 0) {
    where.createdAt = dateRange
  }

  const pm = sp.get('pm')?.toUpperCase()
  if (pm === 'COD' || pm === 'TRANSFER') {
    where.paymentMethod = pm
  }

  const productId = sp.get('productId')?.trim()
  if (productId) {
    where.items = { array_contains: [{ productId }] }
  }

  // Filter gudang asal (fulfillment). '__none__' = order tanpa gudang.
  const warehouseId = sp.get('warehouseId')?.trim()
  if (warehouseId) {
    where.warehouseId = warehouseId === '__none__' ? null : warehouseId
  }

  return where
}

// ── TAB (Semua/Pending/Lunas/Dikirim/Selesai) ────────────────────────────────
export function buildTabFilter(tab: OrderTab): Prisma.UserOrderWhereInput {
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

export function parseTab(value: string | null): OrderTab {
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

// ── SMART FILTER (chip preset) ───────────────────────────────────────────────
export type SmartFilter =
  | 'urgent'
  | 'need_ship'
  | 'need_tracking'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'auto_confirmed'
  | 'unpaid_24h'

export function parseSmart(v: string | null): SmartFilter | null {
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

export function buildSmartFilter(f: SmartFilter): Prisma.UserOrderWhereInput {
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
    case 'today':
      return { createdAt: { gte: startOfTodayWib(now) } }
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
      // PAID yang di-set otomatis BCA Auto-Reader / Moota, bukan manual.
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

// ── KOMBINASI PENUH: base + (smart override tab). Dipakai export CSV supaya ──
// filter identik dengan list. Spread meniru list route (smart/tab menimpa field
// base yang bentrok, mis. createdAt).
export function buildOrderWhere(
  sp: URLSearchParams,
  userId: string,
): Prisma.UserOrderWhereInput {
  const base = buildOrderBaseWhere(sp, userId)
  const smart = parseSmart(sp.get('f'))
  const tabOrSmart = smart
    ? buildSmartFilter(smart)
    : buildTabFilter(parseTab(sp.get('tab')))
  return { ...base, ...tabOrSmart }
}
