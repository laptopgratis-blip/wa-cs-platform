// Lookup kontak untuk pesan yang masuk/keluar lewat SATU sesi WA, saat
// barisnya tidak dibuat ulang (drain antrean CS, cek status takeover fromMe).
//
// Satu nomor pelanggan bisa punya beberapa baris Contact (satu per sesi) —
// terutama setelah impor kontak ke nomor lain. `findFirst({userId, phone})`
// tanpa urutan mengembalikan baris sembarang: baris impor kosong (aiPaused
// false, tanpa riwayat) bisa terbaca, sehingga AI membalas saat CS sedang
// takeover dan balasan CS dari HP tidak tercatat. Urutan sama dengan
// saveMessage: (1) baris sesi pesan, (2) lintas sesi berurut recency.
import type { Prisma } from '@prisma/client'

import { CONTACT_RECENCY_ORDER } from './recency'

export interface ContactFindArgs {
  where: Prisma.ContactWhereInput
  orderBy?: Prisma.ContactOrderByWithRelationInput[]
}

/** Pemanggil membungkus prisma.contact.findFirst + select miliknya sendiri. */
export type ContactFinder<T> = (args: ContactFindArgs) => Promise<T | null>

export async function findContactPreferSession<T>(
  find: ContactFinder<T>,
  key: { userId: string; sessionId: string; phoneNumber: string },
): Promise<T | null> {
  const own = await find({
    where: { userId: key.userId, waSessionId: key.sessionId, phoneNumber: key.phoneNumber },
  })
  if (own) return own
  return find({
    where: { userId: key.userId, phoneNumber: key.phoneNumber },
    orderBy: CONTACT_RECENCY_ORDER,
  })
}
