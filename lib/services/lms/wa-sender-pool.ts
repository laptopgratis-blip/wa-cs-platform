// Pool kandidat sesi WA pengirim untuk notifikasi student (/belajar):
// OTP login, magic link course, dan link akses e-book.
//
// Urutan kandidat: sesi ADMIN platform dulu (perilaku lama), lalu sesi
// PENJUAL yang berelasi dengan nomor student — dari EbookEntitlement
// (ebook.userId) dan Enrollment (course.userId), terbaru dulu. Konteks
// 2026-08-07: nomor WA admin diblokir permanen → tanpa fallback penjual,
// OTP & magic link mati total padahal WA penjual hidup.
//
// sellerUserId eksplisit (dari hook order yang tahu pemilik produk)
// diprioritaskan di urutan pertama setelah admin.
import { prisma } from '@/lib/prisma'

export interface WaSenderCandidate {
  // 'admin' | 'penjual' — untuk logging siapa pengirim yang berhasil.
  label: 'admin' | 'penjual'
  sessionId: string
}

// Maksimal penjual yang dicoba — student lintas banyak toko tetap wajar.
const MAX_SELLER_CANDIDATES = 3

export async function findStudentWaSenders(opts: {
  studentPhone: string
  sellerUserId?: string
}): Promise<WaSenderCandidate[]> {
  const candidates: WaSenderCandidate[] = []
  const seenSessions = new Set<string>()
  const sellerIds: string[] = []

  const admin = await prisma.whatsappSession.findFirst({
    where: { status: 'CONNECTED', user: { role: 'ADMIN' } },
    select: { id: true },
    orderBy: { updatedAt: 'desc' },
  })
  if (admin) {
    candidates.push({ label: 'admin', sessionId: admin.id })
    seenSessions.add(admin.id)
  }

  if (opts.sellerUserId) sellerIds.push(opts.sellerUserId)

  // Penjual yang pernah menjual ke nomor ini — e-book & course, terbaru dulu.
  // Dua query kecil (bukan join raksasa); hasil digabung urut kebaruan kasar:
  // entitlement/enrollment terbaru lebih dulu.
  const [ebookSellers, courseSellers] = await Promise.all([
    prisma.ebookEntitlement.findMany({
      where: { buyerPhone: opts.studentPhone },
      orderBy: { grantedAt: 'desc' },
      take: MAX_SELLER_CANDIDATES,
      select: { ebook: { select: { userId: true } } },
    }),
    prisma.enrollment.findMany({
      where: { studentPhone: opts.studentPhone },
      orderBy: { enrolledAt: 'desc' },
      take: MAX_SELLER_CANDIDATES,
      select: { course: { select: { userId: true } } },
    }),
  ])
  for (const row of ebookSellers) {
    if (row.ebook?.userId) sellerIds.push(row.ebook.userId)
  }
  for (const row of courseSellers) {
    if (row.course?.userId) sellerIds.push(row.course.userId)
  }

  const uniqueSellerIds = Array.from(new Set(sellerIds)).slice(
    0,
    MAX_SELLER_CANDIDATES,
  )
  for (const userId of uniqueSellerIds) {
    const session = await prisma.whatsappSession.findFirst({
      where: { userId, status: 'CONNECTED' },
      select: { id: true },
      orderBy: { updatedAt: 'desc' },
    })
    if (session && !seenSessions.has(session.id)) {
      candidates.push({ label: 'penjual', sessionId: session.id })
      seenSessions.add(session.id)
    }
  }

  return candidates
}
