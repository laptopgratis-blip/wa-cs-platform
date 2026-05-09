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
import { sendStudentMagicLinkEmail } from '@/lib/email'
import { prisma } from '@/lib/prisma'
import { waService } from '@/lib/wa-service'

import { upsertEnrollment } from './enrollment'
import { issueMagicLink } from './student-magic'
import { sendMagicLinkViaWa } from './wa-magic-sender'

const PORTAL_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://hulao.id'

async function findAdminWaSessionId(): Promise<string | null> {
  const session = await prisma.whatsappSession.findFirst({
    where: { status: 'CONNECTED', user: { role: 'ADMIN' } },
    select: { id: true },
    orderBy: { updatedAt: 'desc' },
  })
  return session?.id ?? null
}

async function sendCourseAccessNotif(input: {
  studentPhone: string
  studentName: string | null
  studentEmail: string | null
  courseTitle: string
  courseSlug: string
}): Promise<void> {
  // Issue magic link sekali — dipakai untuk WA & Email body. skipThrottle
  // karena trigger=ENROLLMENT (sistem-issued, bukan user-driven). Token
  // multi-use 90 hari, jadi student bisa simpan/bookmark.
  let magicUrl: string | null = null
  try {
    const link = await issueMagicLink({
      phoneRaw: input.studentPhone,
      channel: 'WA',
      trigger: 'ENROLLMENT',
      skipThrottle: true,
    })
    magicUrl = link.url
  } catch (err) {
    console.error(`[lms-hook] gagal issue magic link:`, err)
  }

  // Primary channel: WA. Pakai sender khusus magic supaya body include link
  // auto-login (bukan link manual ke /belajar yg butuh OTP).
  let waDelivered = false
  if (magicUrl) {
    const sendWa = await sendMagicLinkViaWa({
      studentPhone: input.studentPhone,
      magicUrl,
      courseTitle: input.courseTitle,
      studentName: input.studentName,
    })
    waDelivered = sendWa.delivered
  } else {
    // Fallback ke notif lama (no magic link) kalau token gagal di-issue —
    // student bisa login manual lewat OTP.
    const adminSessionId = await findAdminWaSessionId()
    if (adminSessionId) {
      const greeting = input.studentName ? `Halo ${input.studentName}!` : 'Halo!'
      const text = [
        `*Akses Course Aktif 🎓*`,
        '',
        greeting,
        `Pembayaran kamu untuk *${input.courseTitle}* sudah dikonfirmasi.`,
        '',
        `Buka akses di ${PORTAL_URL}/belajar — login pakai nomor WA ini lewat OTP.`,
        '',
        `_— Hulao Belajar_`,
      ].join('\n')
      const send = await waService.sendMessage(
        adminSessionId,
        input.studentPhone,
        text,
      )
      waDelivered = send.success
    }
  }

  // Email fallback: kirim kalau (a) WA gagal sampai DAN (b) email tersedia.
  // Bukan dual-send untuk hemat SMTP — hanya recovery channel.
  if (!waDelivered && input.studentEmail && magicUrl) {
    try {
      await sendStudentMagicLinkEmail({
        email: input.studentEmail,
        studentName: input.studentName,
        magicUrl,
        courseTitle: input.courseTitle,
      })
      console.warn(
        `[lms-hook] WA gagal — magic link dikirim via email ke ${input.studentEmail} (${input.studentPhone})`,
      )
    } catch (err) {
      console.error(`[lms-hook] email fallback gagal:`, err)
    }
  } else if (!waDelivered) {
    console.warn(
      `[lms-hook] WA gagal & tidak ada email fallback untuk ${input.studentPhone} — student perlu login manual via OTP saat WA pulih`,
    )
  }
}

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
    select: {
      id: true,
      courseId: true,
      course: { select: { title: true, slug: true } },
    },
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
    if (!p.courseId || !p.course) continue
    try {
      // Cek apakah enrollment baru di-create (vs sudah ada → skip notif).
      const existing = await prisma.enrollment.findUnique({
        where: {
          courseId_studentPhone: {
            courseId: p.courseId,
            studentPhone: phone,
          },
        },
        select: { id: true, status: true },
      })

      await upsertEnrollment({
        courseId: p.courseId,
        studentPhone: phone,
        studentName: order.customerName,
        studentEmail: order.customerEmail,
        orderId: order.id,
        invoiceNumber: order.invoiceNumber,
      })
      count += 1

      // Notif WA hanya kalau benar-benar enrollment baru (atau di-reactivate
      // dari REVOKED/EXPIRED). Re-order yg sudah ACTIVE → skip supaya tidak
      // spam student tiap re-purchase.
      const shouldNotify =
        !existing || existing.status !== 'ACTIVE'
      if (shouldNotify) {
        void sendCourseAccessNotif({
          studentPhone: phone,
          studentName: order.customerName,
          studentEmail: order.customerEmail,
          courseTitle: p.course.title,
          courseSlug: p.course.slug,
        }).catch((err) =>
          console.error(`[lms-hook] notif akses gagal:`, err),
        )
      }
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
