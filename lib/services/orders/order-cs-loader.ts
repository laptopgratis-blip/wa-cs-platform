// Pemuat CS WhatsApp untuk satu order — SATU pintu bagi semua titik yang
// perlu tahu "order ini dilayani nomor yang mana": pengirim pesan otomatis
// (follow-up, pesan manual, notif auto-paid) dan nomor yang dilihat pelanggan
// (invoice, wa-link, {wa_admin}). Aturannya ada di order-cs.ts (pure).
//
// NEVER throw: CS produk hanyalah preferensi. Kegagalan membacanya tidak
// boleh menggagalkan kirim pesan / render invoice → kembali ke perilaku lama
// (tanpa CS) dan dicatat di log.
//
// Keamanan: produk DAN sesi selalu difilter `userId` pemilik order, jadi
// id sesi yang tersimpan di produk tidak bisa dipakai lintas akun.

import { prisma } from '@/lib/prisma'

import {
  type CsSessionState,
  NO_ORDER_CS,
  type OrderCs,
  extractOrderProductIds,
  isCsSessionOnline,
  pickOrderCsSessionId,
  resolveCsSender,
} from './order-cs'

// Batas pengaman jumlah id di klausa IN — order nyata berisi segelintir item.
const MAX_PRODUCT_IDS = 100
// Sesi yang belum dihapus milik satu user: praktis < 10. Batas ini hanya
// pengaman.
const MAX_ACTIVE_SESSIONS = 50

const SESSION_SELECT = {
  id: true,
  phoneNumber: true,
  status: true,
  isActive: true,
  updatedAt: true,
} as const

type SessionRow = CsSessionState & { updatedAt: Date }

/** Potongan klien Prisma yang dipakai di sini — `prisma` memenuhinya. */
export interface OrderCsDb {
  product: {
    findMany(args: {
      where: {
        id: { in: string[] }
        userId: string
        csSessionId: { not: null }
      }
      select: { id: true; csSessionId: true }
    }): PromiseLike<Array<{ id: string; csSessionId: string | null }>>
  }
  whatsappSession: {
    findFirst(args: {
      where: { id: string; userId: string }
      select: typeof SESSION_SELECT
    }): PromiseLike<SessionRow | null>
    findMany(args: {
      where: { userId: string; isActive: true; phoneNumber: { not: null } }
      select: typeof SESSION_SELECT
      orderBy: { updatedAt: 'desc' }
      take: number
    }): PromiseLike<SessionRow[]>
  }
}

/**
 * Resolve CS untuk order milik `userId` dengan snapshot `items`
 * (UserOrder.items). Query minimal: order tanpa produk → 0 query; produk
 * tanpa CS → 1; CS online → 2; CS offline/basi (perlu cari padanan nomor) → 3.
 */
export async function loadOrderCs(
  input: { userId: string; items: unknown },
  db: OrderCsDb = prisma,
): Promise<OrderCs> {
  try {
    const productIds = extractOrderProductIds(input.items).slice(
      0,
      MAX_PRODUCT_IDS,
    )
    if (productIds.length === 0) return NO_ORDER_CS

    const products = await db.product.findMany({
      where: {
        id: { in: productIds },
        userId: input.userId,
        csSessionId: { not: null },
      },
      select: { id: true, csSessionId: true },
    })
    const csSessionId = pickOrderCsSessionId(
      productIds,
      new Map(products.map((p) => [p.id, p.csSessionId])),
    )
    if (!csSessionId) return NO_ORDER_CS

    const csSession = await db.whatsappSession.findFirst({
      where: { id: csSessionId, userId: input.userId },
      select: SESSION_SELECT,
    })
    if (!csSession) return NO_ORDER_CS
    if (isCsSessionOnline(csSession)) {
      return resolveCsSender({ csSession, userSessions: [] })
    }

    // Sesi produk offline (umumnya id basi setelah scan ulang) → cari sesi
    // bernomor sama di antara sesi milik user yang sama. Yang diambil semua
    // sesi yang BELUM dihapus (isActive=true), bukan hanya yang CONNECTED:
    // resolver perlu membedakan nomor yang sekadar offline (masih terdaftar →
    // nomor CS tetap dipakai) dari nomor yang sudah dihapus seller (→ nomor
    // toko). Status CONNECTED-nya diperiksa resolver.
    const activeSessions = await db.whatsappSession.findMany({
      where: {
        userId: input.userId,
        isActive: true,
        phoneNumber: { not: null },
      },
      select: SESSION_SELECT,
      orderBy: { updatedAt: 'desc' },
      take: MAX_ACTIVE_SESSIONS,
    })
    return resolveCsSender({ csSession, userSessions: activeSessions })
  } catch (err) {
    console.error(
      `[order-cs] gagal memuat CS order (user ${input.userId}):`,
      err,
    )
    return NO_ORDER_CS
  }
}
