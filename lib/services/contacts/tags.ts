// Daftar tag unik milik user (untuk dropdown filter Kontak & pemilih target
// Broadcast).
//
// Dulu tag dikumpulkan dari `findMany({ take: 500 })` tanpa urutan — sampel
// sembarang. Setelah impor kontak, tag impor bisa TIDAK muncul (mis. 50
// kontak impor di antara 5.000 kontak lama) sehingga seller tak bisa memilih
// tag itu sebagai target broadcast. Prisma tidak punya DISTINCT atas elemen
// array, jadi pakai raw query ber-parameter (tagged template = aman injeksi).
import { prisma } from '@/lib/prisma'

// Maks 500 tag (literal di SQL: parameter LIMIT bisa terkirim sebagai
// numeric dan ditolak Postgres).
export async function listContactTags(userId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ tag: string }[]>`
    SELECT DISTINCT t AS tag
    FROM "Contact" c, unnest(c."tags") AS t
    WHERE c."userId" = ${userId}
    ORDER BY t
    LIMIT 500
  `
  return rows.map((r) => r.tag)
}
