// Dispatcher entitlement digital saat order transisi PAID/CANCELLED.
//
// Satu titik panggil untuk SEMUA jenis aset digital (LMS course + e-book) —
// dipasang di setiap situs transisi status order:
//   PAID     → triggerEntitlementsForOrderSafe
//   CANCELLED→ revokeEntitlementsForOrderSafe
// Situs transisi (grep marker): PATCH /api/orders/[id], bulk-update,
// internal/order-auto-paid, bank-mutation manual-match, payment/order-webhook,
// cron/order-payment-reconcile.
import { prisma } from '@/lib/prisma'
import { triggerEbookEntitlementsForOrderSafe } from '@/lib/services/ebook/order-hook'
import { triggerEnrollmentForOrderSafe } from '@/lib/services/lms/order-hook'

// Grant semua entitlement digital utk order PAID. Fire-and-forget,
// never-throw — masing-masing hook sudah punya wrapper Safe sendiri.
export function triggerEntitlementsForOrderSafe(orderId: string): void {
  triggerEnrollmentForOrderSafe(orderId)
  triggerEbookEntitlementsForOrderSafe(orderId)
}

// Cabut akses digital saat order dibatalkan/di-refund. Hanya entitlement
// milik ORDER INI (by orderId) — pembelian lain milik pembeli yang sama
// tidak tersentuh. Soft-revoke (row tetap ada utk audit + bisa di-restore).
export async function revokeEntitlementsForOrder(
  orderId: string,
  reason: string,
): Promise<void> {
  const now = new Date()
  await prisma.ebookEntitlement.updateMany({
    where: { orderId, status: 'ACTIVE' },
    data: { status: 'REVOKED', revokedAt: now, revokeReason: reason },
  })
  // Sekalian tutup celah LMS lama: cancel order dulunya tidak pernah
  // merevoke Enrollment (bulk reject bisa membatalkan order PAID ber-course
  // tanpa mencabut akses).
  await prisma.enrollment.updateMany({
    where: { orderId, status: 'ACTIVE' },
    data: { status: 'REVOKED', revokedAt: now, revokeReason: reason },
  })
}

export function revokeEntitlementsForOrderSafe(
  orderId: string,
  reason: string,
): void {
  void revokeEntitlementsForOrder(orderId, reason).catch((err) => {
    console.error(
      `[entitlement-hook] revoke gagal orderId=${orderId}:`,
      err,
    )
  })
}
