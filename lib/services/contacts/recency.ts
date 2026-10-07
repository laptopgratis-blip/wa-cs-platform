// Urutan "kontak paling relevan" saat satu nomor pelanggan punya beberapa
// baris Contact (satu per sesi WA) dan lookup dilakukan lintas sesi
// (userId + phoneNumber).
//
// Postgres mengurutkan DESC dengan NULLS FIRST. Kontak hasil impor/sinkron
// (belum pernah bercakap → lastMessageAt NULL) dulu MENANG atas percakapan
// nyata di sesi lain: pesan masuk menempel ke baris impor yang kosong (inbox
// pecah, AI kehilangan riwayat) dan cek window 24 jam Cloud membaca baris
// tanpa window (balasan CS ditolak WINDOW_CLOSED). NULL ditaruh di akhir.
import type { Prisma } from '@prisma/client'

export const CONTACT_RECENCY_ORDER: Prisma.ContactOrderByWithRelationInput[] = [
  { lastMessageAt: { sort: 'desc', nulls: 'last' } },
  { updatedAt: 'desc' },
]
