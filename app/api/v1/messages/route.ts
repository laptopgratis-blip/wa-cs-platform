// GET /api/v1/messages?contactId=&limit=&cursor= — riwayat pesan satu kontak.
//
// `contactId` WAJIB: tanpa itu endpoint ini jadi dump seluruh riwayat percakapan
// akun, yang bukan tujuan API baca Fase 1.
//
// Model Message TIDAK punya userId — kepemilikan hanya lewat
// contactId → Contact.userId, jadi filter selalu `contact: { userId }`.
import { apiV1Error, apiV1Ok, parsePagination, requirePublicApiAuth } from '@/lib/public-api-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const gate = await requirePublicApiAuth(req)
  if (!gate.ok) return gate.response

  const url = new URL(req.url)
  const contactId = url.searchParams.get('contactId')?.trim()
  if (!contactId) {
    return apiV1Error('invalid_query', 'Parameter contactId wajib diisi.', 400, gate.auth.rateLimitHeaders)
  }

  const page = parsePagination(url)
  if (!page.ok) return apiV1Error('invalid_query', page.error, 400, gate.auth.rateLimitHeaders)

  try {
    // Cek kepemilikan kontak dulu supaya id milik orang lain dijawab 404,
    // bukan daftar kosong yang membingungkan.
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, userId: gate.auth.userId },
      select: { id: true },
    })
    if (!contact) {
      return apiV1Error('not_found', 'Kontak tidak ditemukan.', 404, gate.auth.rateLimitHeaders)
    }

    // Cursor WAJIB divalidasi dalam scope yang sama (lihat komentar panjang di
    // app/api/v1/contacts/route.ts): anchor cursor Prisma tidak ikut memakai
    // klausa where, jadi cursor basi/asing menghilangkan baris diam-diam.
    if (page.cursor) {
      const anchor = await prisma.message.findFirst({
        where: { id: page.cursor, contactId, contact: { userId: gate.auth.userId } },
        select: { id: true },
      })
      if (!anchor) {
        return apiV1Error(
          'invalid_cursor',
          'Cursor tidak dikenal atau pesannya sudah dihapus. Ulangi dari halaman pertama.',
          400,
          gate.auth.rateLimitHeaders,
        )
      }
    }

    const rows = await prisma.message.findMany({
      where: { contactId, contact: { userId: gate.auth.userId } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: page.limit + 1,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
      // Kolom margin platform (apiCostRp/revenueRp/profitRp/tokensCharged)
      // TIDAK boleh keluar.
      select: {
        id: true,
        contactId: true,
        content: true,
        role: true,
        status: true,
        source: true,
        externalMsgId: true,
        createdAt: true,
      },
    })

    const hasMore = rows.length > page.limit
    const items = hasMore ? rows.slice(0, page.limit) : rows

    return apiV1Ok(
      {
        items: items.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
        nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      },
      gate.auth,
    )
  } catch (err) {
    console.error('[api/v1/messages] gagal:', err)
    return apiV1Error('server_error', 'Gagal memuat pesan.', 500, gate.auth.rateLimitHeaders)
  }
}
