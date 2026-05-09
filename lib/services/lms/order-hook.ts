// LMS Order Hook — auto-enroll student saat order PAID.
//
// Dipanggil dari setiap titik di mana order transition ke PAID:
//   1. PATCH /api/orders/[id] (admin manual edit)
//   2. POST  /api/orders/bulk-update (admin bulk PAID)
//   3. POST  /api/internal/order-auto-paid (bank scraper auto-match)
//   4. POST  /api/integrations/bank-mutation/mutations/[id]/manual-match
//
// Idempotent: aman kalau dipanggil 2x untuk order yg sama (upsert ke
// (courseId, studentPhone) unique). Kegagalan tidak boleh blok flow utama
// — wrap caller dgn try/catch + log, jangan throw.
import { prisma } from '@/lib/prisma'

import { upsertEnrollment } from './enrollment'

// Normalize phone ke E.164-style Indonesia (628xxx, no '+'). Idempotent.
// Input bisa "08xxx", "+628xxx", "628xxx", atau gabungan dgn space/dash.
// Return null kalau tidak valid (kosong atau < 10 digit setelah strip).
function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 10) return null
  if (digits.startsWith('62')) return digits
  if (digits.startsWith('0')) return `62${digits.slice(1)}`
  // Fallback: assume already country-code-free, prepend 62.
  return `62${digits}`
}

interface OrderItem {
  productId?: string
  qty?: number
  // ... field lain di-ignore di hook ini
}

// Trigger auto-enrollment untuk semua product di order yg punya courseId.
// Return jumlah enrollment yg di-upsert (untuk logging).
export async function triggerEnrollmentForOrder(
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
  // Safety guard — hanya proses kalau benar-benar PAID. Caller diharapkan
  // panggil setelah update status, tapi guard ini cegah race kalau ada
  // out-of-order invocation.
  if (order.paymentStatus !== 'PAID') return 0

  // Parse items JSON. Items punya struktur { productId, qty, ... }.
  const items = Array.isArray(order.items)
    ? (order.items as unknown as OrderItem[])
    : []
  const productIds = Array.from(
    new Set(
      items.map((i) => i.productId).filter((id): id is string => Boolean(id)),
    ),
  )
  if (productIds.length === 0) return 0

  // Filter product yg punya courseId attached. PUBLISHED only — kalau course
  // masih DRAFT / ARCHIVED, enrollment tidak di-trigger (admin lupa publish
  // bukan masalah customer).
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      courseId: { not: null },
      course: { status: 'PUBLISHED' },
    },
    select: { id: true, courseId: true },
  })
  if (products.length === 0) return 0

  const phone = normalizePhone(order.customerPhone)
  if (!phone) {
    console.warn(
      `[lms-hook] order ${orderId} customerPhone="${order.customerPhone}" tidak valid setelah normalisasi — skip enrollment`,
    )
    return 0
  }

  let count = 0
  for (const p of products) {
    if (!p.courseId) continue
    try {
      await upsertEnrollment({
        courseId: p.courseId,
        studentPhone: phone,
        studentName: order.customerName,
        studentEmail: order.customerEmail,
        orderId: order.id,
        invoiceNumber: order.invoiceNumber,
      })
      count += 1
    } catch (err) {
      // Per-course error tidak boleh blok yg lain.
      console.error(
        `[lms-hook] gagal enroll order=${orderId} course=${p.courseId}:`,
        err,
      )
    }
  }
  return count
}

// Wrapper untuk panggil hook tanpa pernah throw — caller tidak perlu
// try/catch. Best-effort: enrollment gagal tidak boleh batalkan PAID.
export function triggerEnrollmentForOrderSafe(orderId: string): void {
  void triggerEnrollmentForOrder(orderId).catch((err) => {
    console.error(`[lms-hook] unexpected error orderId=${orderId}:`, err)
  })
}
