// E-Book Order Hook — grant EbookEntitlement saat order PAID.
// Cermin lib/services/lms/order-hook.ts (auto-enrollment course).
//
// Dipanggil lewat dispatcher lib/services/entitlement-hook.ts dari setiap
// titik transisi order → PAID (PATCH orders/[id], bulk-update, bank scraper,
// manual-match, webhook Tripay, cron reconcile).
//
// Idempotent: upsert ke unique (ebookId, buyerPhone); double-invoke untuk
// order yang sama = no-op. Tidak boleh throw ke caller — pakai wrapper Safe.
import { prisma } from '@/lib/prisma'
// SATU normalizer dgn portal /belajar — identitas login harus match
// EbookEntitlement.buyerPhone, jangan bikin varian normalisasi baru.
import { normalizeStudentPhone } from '@/lib/services/lms/student-auth'

import { notifyEbookAccess } from './access-notif'

interface OrderItem {
  productId?: string
  price?: number
  qty?: number
}

// Grant entitlement untuk semua produk ber-ebookId di order. Return jumlah
// entitlement yang di-grant/reset (untuk logging).
export async function triggerEbookEntitlementsForOrder(
  orderId: string,
): Promise<number> {
  const order = await prisma.userOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      items: true,
      customerPhone: true,
      customerName: true,
      customerEmail: true,
      invoiceNumber: true,
      paymentStatus: true,
    },
  })
  if (!order) return 0
  // Guard anti out-of-order invocation — hanya proses order PAID.
  if (order.paymentStatus !== 'PAID') return 0

  const items = Array.isArray(order.items)
    ? (order.items as unknown as OrderItem[])
    : []
  const productIds = Array.from(
    new Set(
      items.map((i) => i.productId).filter((id): id is string => Boolean(id)),
    ),
  )
  if (productIds.length === 0) return 0

  // Hanya e-book aktif — kalau seller sudah nonaktifkan, jangan grant baru
  // (pembeli lama tidak terpengaruh, entitlement mereka sudah ada).
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      ebookId: { not: null },
      ebook: { isActive: true },
    },
    select: {
      id: true,
      ebookId: true,
      ebook: {
        select: { id: true, title: true, maxDownloads: true, accessDays: true },
      },
    },
  })
  if (products.length === 0) return 0

  const phone = normalizeStudentPhone(order.customerPhone)
  if (!phone) {
    console.warn(
      `[ebook-hook] order ${orderId} customerPhone="${order.customerPhone}" tidak valid — skip grant`,
    )
    return 0
  }

  let count = 0
  for (const p of products) {
    if (!p.ebookId || !p.ebook) continue
    try {
      const existing = await prisma.ebookEntitlement.findUnique({
        where: {
          ebookId_buyerPhone: { ebookId: p.ebookId, buyerPhone: phone },
        },
        select: { id: true, status: true, orderId: true },
      })

      // Double-invoke untuk order yang sama & entitlement sudah ACTIVE →
      // no-op total (jangan reset counter/notif).
      if (
        existing &&
        existing.status === 'ACTIVE' &&
        existing.orderId === order.id
      ) {
        continue
      }

      // Snapshot harga item (price × qty) utk statistik omzet per e-book.
      const item = items.find((i) => i.productId === p.id)
      const pricePaidRp =
        item && typeof item.price === 'number'
          ? item.price * (item.qty ?? 1)
          : null

      const now = new Date()
      const expiresAt = p.ebook.accessDays
        ? new Date(now.getTime() + p.ebook.accessDays * 24 * 60 * 60 * 1000)
        : null

      const grantData = {
        buyerName: order.customerName,
        buyerEmail: order.customerEmail,
        orderId: order.id,
        invoiceNumber: order.invoiceNumber,
        pricePaidRp,
        status: 'ACTIVE' as const,
        grantedAt: now,
        expiresAt,
        revokedAt: null,
        revokeReason: null,
        // Snapshot setting saat grant — perubahan setting e-book belakangan
        // tidak mengubah hak pembeli lama.
        maxDownloads: p.ebook.maxDownloads,
        // Pembelian baru/ulang = jatah download fresh + notif akses dikirim
        // ulang (accessNotifiedAt null → notif + disweep cron kalau gagal).
        downloadCount: 0,
        accessNotifiedAt: null,
      }

      const entitlement = await prisma.ebookEntitlement.upsert({
        where: {
          ebookId_buyerPhone: { ebookId: p.ebookId, buyerPhone: phone },
        },
        create: {
          ebookId: p.ebookId,
          buyerPhone: phone,
          ...grantData,
          purchaseCount: 1,
          totalPaidRp: pricePaidRp ?? 0,
        },
        // Akumulator TIDAK di-reset: beli ulang menambah terjual & omzet
        // (guard no-op di atas mencegah double-invoke order sama).
        update: {
          ...grantData,
          purchaseCount: { increment: 1 },
          totalPaidRp: { increment: pricePaidRp ?? 0 },
        },
        select: { id: true },
      })
      count += 1

      void notifyEbookAccess(entitlement.id).catch((err) =>
        console.error(`[ebook-hook] notif akses gagal:`, err),
      )
    } catch (err) {
      // Per-ebook error tidak boleh blok yang lain.
      console.error(
        `[ebook-hook] gagal grant order=${orderId} ebook=${p.ebookId}:`,
        err,
      )
    }
  }
  return count
}

// Wrapper never-throw — kegagalan grant tidak boleh batalkan flow PAID.
export function triggerEbookEntitlementsForOrderSafe(orderId: string): void {
  void triggerEbookEntitlementsForOrder(orderId).catch((err) => {
    console.error(`[ebook-hook] unexpected error orderId=${orderId}:`, err)
  })
}
